/*
 * Copyright 2015 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
//module Shumway.AVM1 {

import { CHECK_AVM1_HANG_EVERY, generateActionCalls } from './interpreter';
import { ActionCodeBlock, ActionCodeBlockItem, ActionItemFlags, AnalyzerResults } from './analyze';
import { ActionCode, ParsedPushConstantAction, ParsedPushRegisterAction } from './parser';
import { AVM1ActionsData, AVM1Context } from './context';
import { avm1DebuggerEnabled } from './settings';
import { ActionsDataStream } from './stream';
import { notImplemented } from '@awayfl/swf-loader';

const IS_INVALID_NAME = /[^A-Za-z0-9_/]+/g;

interface IExecutionContext {
	constantPool: any[];
	registers: any[];
	stack: any[];
	isEndOfActions: boolean;
}

let cachedActionsCalls: StringMap<Function> = null;
function getActionsCalls() {
	if (!cachedActionsCalls) {
		cachedActionsCalls = generateActionCalls();
	}
	return cachedActionsCalls;
}

class CustomOperationAction {
	constructor(
		public inlinePop: boolean = false) {}
}

interface IHoistMap {
	forward: StringMap<string>;
	back: StringMap<string>;
}

interface IOptFlags  {
	// function support apply stack as arguments
	AllowStackToArgs?: boolean;
	// generate arguments instad of passing as array
	// (ctx, [a, b]) => (ctx, a, b)
	PlainArgs?: boolean;
	ArgsCount?: number;

	// function support return value
	AllowReturnValue?: boolean;
	AllowCallapsDouble?: boolean;
}

interface ISharedFlags extends ActionItemFlags, IOptFlags {}

const ActionOptMap: NumberMap<IOptFlags> = {
	[ActionCode.ActionGetMember]: {
		AllowReturnValue: true,
		AllowStackToArgs: true,
		AllowCallapsDouble: true,
		ArgsCount: 2,
	},
	[ActionCode.ActionSetMember]: {
		AllowStackToArgs: true,
		ArgsCount: 3,
	},
	[ActionCode.ActionAdd2]: {
		AllowStackToArgs: true,
		AllowReturnValue: true,
		PlainArgs: true,
		ArgsCount: 2,
	},
	[ActionCode.ActionGreater]: {
		AllowStackToArgs: true,
		AllowReturnValue: true,
		ArgsCount: 2,
	},
};

/**
 *  Bare-minimum JavaScript code generator to make debugging better.
 */
export class ActionsDataCompiler {
	private convertArgs(args: any[], id: number, res, ir: AnalyzerResults): string {
		const parts: string[] = [];
		let arg;
		const argsLen: number = args.length;
		let constant;
		let hint: string;
		let currentConstantPool;
		let registerNumber: number;
		let resName: string;
		for (let i: number = 0; i < argsLen; i++) {
			arg = args[i];
			if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
				if (arg instanceof ParsedPushConstantAction) {
					if (ir.singleConstantPool) {
						constant = ir.singleConstantPool[(<ParsedPushConstantAction> arg).constantIndex];
						parts.push(constant === undefined ? 'undefined' : JSON.stringify(constant));
					} else {
						hint = '';
						currentConstantPool = res.constantPool;
						if (currentConstantPool) {
							constant = currentConstantPool[(<ParsedPushConstantAction> arg).constantIndex];
							hint = constant === undefined ? 'undefined' : JSON.stringify(constant);
							// preventing code breakage due to bad constant
							hint = hint.indexOf('*/') >= 0 ? '' : ' /* ' + hint + ' */';
						}
						parts.push('constantPool[' + (<ParsedPushConstantAction> arg).constantIndex + ']' + hint);
					}
				} else if (arg instanceof ParsedPushRegisterAction) {
					registerNumber = (<ParsedPushRegisterAction> arg).registerNumber;
					if (registerNumber < 0 || registerNumber >= ir.registersLimit) {
						parts.push('undefined'); // register is out of bounds -- undefined
					} else {
						parts.push('registers[' + registerNumber + ']');
					}
				} else if (arg instanceof AVM1ActionsData) {
					resName = 'code_' + id + '_' + i;
					res[resName] = arg;
					parts.push('res.' + resName);
				} else if (arg instanceof CustomOperationAction) {
					if (arg.inlinePop) parts.push('stack.pop()');
				} else {
					notImplemented('Unknown AVM1 action argument type');
				}
			} else if (arg === undefined) {
				parts.push('undefined'); // special case
			} else {
				parts.push(JSON.stringify(arg));
			}
		}
		return parts.join(',');
	}

	/* eslint-disable-next-line max-len */
	private convertAction(item: ActionCodeBlockItem, id: number, res, indexInBlock: number, ir: AnalyzerResults, items: ActionCodeBlockItem[], hoists: IHoistMap): string {
		// const calls = getActionsCalls();
		const prevItem = items[indexInBlock - 1];
		const flags: ISharedFlags = item.flags;
		let result = '';

		if (flags?.optimised) {
			result = `  /* ${item.action.actionName} optimised */\n`;
		}

		if (flags?.killed) {
			return `  /* ${item.action.actionName} killed by optimiser */\n`;
		}

		if (!item.action.knownAction) {
			return `  // unknown actionCode ${item.action.actionCode} at ${item.action.position}\n`;
		}

		switch (item.action.actionCode) {
			case ActionCode.ActionJump:
			case ActionCode.ActionReturn:
				return '';
			case ActionCode.ActionConstantPool:
				res.constantPool = item.action.args[0];
				hoists.forward[`constPool${id}`] = `[${this.convertArgs(item.action.args[0], id, res, ir)}]`;
				return `  constantPool = ectx.constantPool = constPool${id};\n`;

			case ActionCode.ActionPush:
				return result + '  stack.push(' + this.convertArgs(item.action.args, id, res, ir) + ');\n';
			case ActionCode.ActionStoreRegister: {
				const registerNumber = item.action.args[0];
				if (registerNumber < 0 || registerNumber >= ir.registersLimit) {
					return ''; // register is out of bounds -- noop
				}
				return '  registers[' + registerNumber + '] = stack[stack.length - 1];\n';
			}
			case ActionCode.ActionWaitForFrame:
			case ActionCode.ActionWaitForFrame2: {
				const args = this.convertArgs(item.action.args, id, res, ir);

				return '  if (calls.' + item.action.actionName + '(ectx,[' +
					args + '])) { position = ' + item.conditionalJumpTo + '; ' +
					'checkTimeAfter -= ' + (indexInBlock + 1) + '; break; }\n';
			}
			case ActionCode.ActionIf:
				return '  if (!!stack.pop()) { position = ' + item.conditionalJumpTo + '; ' +
					'checkTimeAfter -= ' + (indexInBlock + 1) + '; break; }\n';
			default: {
				let args = item.action.args ? this.convertArgs(item.action.args, id, res, ir) : '';

				if (args && !flags.PlainArgs) {
					args = '[' + args + ']';
				}

				if (item.action.actionCode === ActionCode.ActionDefineFunction2) {
					const name = `defFunArgs${id}`;
					hoists.forward[name] = args;
					args = name;
				}

				result += '  calls.' + item.action.actionName + '(ectx' +
					(args ? ', ' + args : '') + ');\n';

				if (item.action.actionName == 'ActionCallMethod') {
					if (!prevItem) {
						result = `// strange oppcode at ${item.action.position}\n` + result;
					}
					if (prevItem && prevItem.action.actionCode == ActionCode.ActionPush) {
						const args = this.convertArgs(prevItem.action.args, id - 1, res, ir);
						if (args == '"gotoAndStop"' || args == '"gotoAndPlay"') {
						//|| args=='"nextFrame"' || args=='"prevFrame"'){
							/* eslint-disable-next-line max-len */
							result += '  if(ectx.scopeList && ectx.scopeList.scope && ectx.scopeList.scope.adaptee && !ectx.scopeList.scope.adaptee.parent){ ectx.framescriptmanager.execute_avm1_constructors(); return;}\n';

						}
					}
				}
				return result;
			}
		}
	}

	basicOptBlock(item: ActionCodeBlockItem, items: ActionCodeBlockItem[], pushStack: number[]): void {
		if (!pushStack.length) {
			return;
		}
		const itemFlags: ISharedFlags = item.flags;
		const code = item.action.actionCode;
		const pushItem = items[pushStack[0]];

		pushStack.length = 0;

		const flags = ActionOptMap[code];
		if (!flags || !flags.AllowStackToArgs) {
			return;
		}

		itemFlags.PlainArgs = flags.PlainArgs;

		const stackArgs = pushItem.action.args;
		// push stack args to getMemberArgs, to reduce array movements

		if (stackArgs.length === flags.ArgsCount) {
			pushItem.flags.killed = true;
			item.action.args = stackArgs;
		} else if (stackArgs.length > flags.ArgsCount) {
			const index = stackArgs.length - flags.ArgsCount;

			item.action.args = stackArgs.slice(index);
			stackArgs.length = index;
			pushItem.flags.optimised = true;
		} else {
			const delta = flags.ArgsCount - stackArgs.length;
			if (delta > 1) {
				// Optimiser pop operands to arguments in reverse order
				// this is BUGed if args more that 1. Skip this;
				return;
			}

			pushItem.flags.killed = true;
			item.action.args = stackArgs.slice();

			for (let i = 0; i < delta; i++) {
				item.action.args.unshift(new CustomOperationAction(true));
			}
		}

		itemFlags.optimised = true;
	}

	optimiser(block: ActionCodeBlock): void {
		const items = block.items;
		const pushStack = [];

		for (let i = 0, l = items.length; i < l; i++) {
			const item = items[i];
			const code = item.action.actionCode;
			item.flags = item.flags || {};

			if (code !== ActionCode.ActionPush) {
				/*
				  optimise push, push, push instruction to one push (arg, arg1, arg2)
				  to many used in obfuscated code
				 */
				if (pushStack.length > 1) {
					const from = pushStack[0];
					const to = pushStack[pushStack.length - 1];
					const target = items[from].action;

					for (let i = from + 1; i <= to; i++) {
						target.args = target.args.concat(items[i].action.args);
						items[i].flags.killed = true;
					}
				}

				this.basicOptBlock(item, items, pushStack);
			}

			switch (code) {
				case ActionCode.ActionPush: {
					pushStack.push(i);
					break;
				}

				case ActionCode.ActionGetMember: {
					// collaps doubled calls to args
					const selfArgs = item.action.args;

					// args not inlined, skip
					if (!selfArgs?.length) {
						break;
					}

					const first = selfArgs[0];
					// first item should be inline pop, that we shure that opp not statically passed
					if (!(first instanceof CustomOperationAction) || !first.inlinePop) {
						break;
					}

					let j = i - 1;
					// skip oppcodes, that is killed
					for (; j >= 0; j--) {
						if (!items[j].flags.killed) {
							break;
						}
					}

					const topOpp = items[j];

					// chain
					const topArgs = topOpp.action.args;
					if (topOpp.action.actionCode === ActionCode.ActionGetMember && topArgs?.length) {
						topOpp.flags.killed = true;
						item.flags.optimised = true;

						// prepend arguments from top, drop first, because it pop
						selfArgs.shift();
						for (let i = topArgs.length - 1; i >= 0; i--) {
							selfArgs.unshift(topArgs[i]);
						}
					}
				}
			}

		}
	}

	generate(ir: AnalyzerResults, debugPath: string = null): Function {
		const blocks = ir.blocks;
		const res = {};
		const hoists: IHoistMap = {
			forward: {}, back: {}
		};

		const debugName = ir.dataId.replace(IS_INVALID_NAME, '_');
		const header = 'return function ' + debugName + '(ectx) {\n' +
			'var position = 0;\n' +
			'var checkTimeAfter = 0;\n' +
			'var constantPool = ectx.constantPool, registers = ectx.registers, stack = ectx.stack;\n';

		let beforeHeader = '';
		let fn = '';

		if (avm1DebuggerEnabled.value) {
			fn += '/* Running ' + debugName + ' */ ' +
				'if (Shumway.AVM1.Debugger.pause || Shumway.AVM1.Debugger.breakpoints.' +
				debugName + ') { debugger; }\n';
		}
		fn += 'while (!ectx.isEndOfActions) {\n' +
			`if (checkTimeAfter <= 0) { checkTimeAfter = ${CHECK_AVM1_HANG_EVERY}; ectx.context.checkTimeout(); }\n\n` +
			'switch(position) {\n';

		let uuid = 0;
		blocks.forEach((b: ActionCodeBlock) => {
			fn += ' case ' + b.label + ':\n';

			this.optimiser(b);
			const actLines = b.items.map((item: ActionCodeBlockItem, index: number) => {
				return this.convertAction(item, uuid++, res, index, ir, b.items, hoists);
			});

			fn += actLines.join('');

			fn += '  position = ' + b.jump + ';\n' +
				'  checkTimeAfter -= ' + b.items.length + ';\n' +
				'  break;\n';
		});
		fn += ' default: ectx.isEndOfActions = true; break;\n}\n}\n' +
			'return stack.pop();};';

		beforeHeader += '\n// hoisted vars\n';
		for (const key in hoists.forward) {
			beforeHeader += `var ${key} = ${hoists.forward[key]};\n`;
		}
		beforeHeader += '\n';

		fn = beforeHeader + header + fn;
		fn += '//# sourceURL=http://jit/' + (debugPath && !IS_INVALID_NAME.test(debugPath) ? debugPath : debugName);

		try {
			return (new Function('calls', 'res', fn))(getActionsCalls(), res);
		} catch (e) {
			// eslint-disable-next-line no-debugger
			debugger;
			throw e;
		}
	}
}

// Instead of compiling, we can match frequently used actions patterns and use
// the dictionary functions without analyzing or compilations of the code.
// The functions/patterns were selected by analyzing the large amount of
// real-life SWFs.
export function findWellknowCompilation(actionsData: AVM1ActionsData, context: AVM1Context): Function {
	const bytes = actionsData.bytes;

	let fn: Function = null;
	if (bytes.length === 0 || bytes[0] === ActionCode.None) {
		// Empty/no actions or first command is ActionEnd.
		fn = actionsNoop;
	} else if (bytes.length >= 2 && bytes[1] === ActionCode.None) {
		// Single bytes actions: ActionPlay, ActionStop, ActionStopSounds
		// Example: 07 00
		switch (bytes[0]) {
			case ActionCode.ActionPlay:
				fn = actionsPlay;
				break;
			case ActionCode.ActionStop:
				fn = actionsStop;
				break;
			case ActionCode.ActionStopSounds:
				fn = actionsStopSounds;
				break;
		}
	} else if (bytes.length >= 7 && bytes[6] === ActionCode.None &&
		bytes[0] === ActionCode.ActionGotoFrame &&
		bytes[1] === 2 && bytes[2] === 0 &&
		bytes[5] === ActionCode.ActionPlay) {
		// ActionGotoFrame n, ActionPlay
		// Example: 81 02 00 04 00 06 00
		const frameIndex = bytes[3] | (bytes[4] << 8);
		fn = actionsGotoFrame.bind(null, [frameIndex, true]);
	} else if (bytes.length >= 6 && bytes[0] === ActionCode.ActionGoToLabel &&
		bytes[2] === 0 && bytes.length >= bytes[1] + 5 &&
		bytes[bytes[1] + 4] === ActionCode.None &&
		bytes[bytes[1] + 3] === ActionCode.ActionPlay) {
		//  ActionGoToLabel s, ActonPlay
		// Example: 8c 03 00 73 31 00 06 00
		const stream = new ActionsDataStream(bytes.subarray(3, 3 + bytes[1]), context.swfVersion);
		const label = stream.readString();
		fn = actionsGotoLabel.bind(null, [label, true]);
	}

	// TODO debugger pause and breakpoints ?
	return fn;
}

function actionsNoop(ectx: IExecutionContext) {
	// no operations stub
}

function actionsPlay(ectx: IExecutionContext) {
	getActionsCalls().ActionPlay(ectx);
}

function actionsStop(ectx: IExecutionContext) {
	getActionsCalls().ActionStop(ectx);
}

function actionsStopSounds(ectx: IExecutionContext) {
	getActionsCalls().ActionStopSounds(ectx);
}

function actionsGotoFrame(args: any[], ectx: IExecutionContext) {
	getActionsCalls().ActionGotoFrame(ectx, args);
}

function actionsGotoLabel(args: any[], ectx: IExecutionContext) {
	getActionsCalls().ActionGoToLabel(ectx, args);
}
