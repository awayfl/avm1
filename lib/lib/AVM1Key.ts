/**
 * Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

//module Shumway.AVM1.Lib {
import { AVM1Context } from '../context';
import { alCallProperty, } from '../runtime';
import { wrapAVM1NativeClass } from './AVM1Utils';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVMStage } from '@awayfl/swf-loader';

export class AVM1Key extends AVM1Object {
	public static BACKSPACE: number = 8;
	public static CAPSLOCK: number = 20;
	public static CONTROL: number = 17;
	public static DELETEKEY: number = 46;
	public static DOWN: number = 40;
	public static END: number = 35;
	public static ENTER: number = 13;
	public static ESCAPE: number = 27;
	public static HOME: number = 36;
	public static INSERT: number = 45;
	public static LEFT: number = 37;
	public static PGDN: number = 34;
	public static PGUP: number = 33;
	public static RIGHT: number = 39;
	public static SHIFT: number = 16;
	public static SPACE: number = 32;
	public static TAB: number = 9;
	public static UP: number = 38;

	public static _keyStates: any[];
	public static _lastKeyCode: number;

	public static createAVM1Class(context: AVM1Context): AVM1Object {
		const wrapped = wrapAVM1NativeClass(context, false, AVM1Key,
			['BACKSPACE', 'CAPSLOCK', 'CONTROL', 'DELETEKEY', 'DOWN',
				'END', 'ENTER', 'ESCAPE', 'HOME', 'INSERT', 'LEFT',
				'PGDN','PGUP','RIGHT', 'SHIFT', 'SPACE', 'TAB', 'UP','isDown', 'getCode', 'getAscii'],
			[]);
		return wrapped;
	}

	static alInitStatic(context: AVM1Context): void {
		this._keyStates = [];
		this._lastKeyCode = 0;
	}

	public static keyDownDelegate: any=null;
	public static keyUpDelegate: any=null;

	public static bindStage(context: AVM1Context, cls: AVM1Object, stage: AVMStage, htmlElement: HTMLElement): void {

		// TODO: should be listening on MouseManager for key-input ?

		if (AVM1Key.keyDownDelegate)
			htmlElement.removeEventListener('keydown', AVM1Key.keyDownDelegate);

		if (AVM1Key.keyUpDelegate)
			htmlElement.removeEventListener('keyup', AVM1Key.keyUpDelegate);

		AVM1Key.keyDownDelegate = (e: KeyboardEvent)=>{
			const staticState: typeof AVM1Key = context.getStaticState(AVM1Key);
			staticState._lastKeyCode = e.keyCode;
			staticState._keyStates[e.keyCode] = 1;
			alCallProperty(cls, 'broadcastMessage', ['onKeyDown']);
		};
		AVM1Key.keyUpDelegate = (e: KeyboardEvent)=>{
			const staticState: typeof AVM1Key = context.getStaticState(AVM1Key);
			staticState._lastKeyCode = e.keyCode;
			delete staticState._keyStates[e.keyCode];
			alCallProperty(cls, 'broadcastMessage', ['onKeyUp']);
		};

		htmlElement.addEventListener('keydown', AVM1Key.keyDownDelegate);
		htmlElement.addEventListener('keyup', AVM1Key.keyUpDelegate);

	}

	public static isDown(context: AVM1Context, code) {
		const staticState: typeof AVM1Key = context.getStaticState(AVM1Key);
		return !!staticState._keyStates[code];
	}

	public static getCode(context: AVM1Context): number {
		const staticState: typeof AVM1Key = context.getStaticState(AVM1Key);
		return staticState._lastKeyCode;
	}

	public static getAscii(context: AVM1Context): number {
		// really this is not same, but charCode depricated and emmited only on keypress (after keyDown)
		// that can't be used for us
		// keycode similar while meta keys not used
		const staticState: typeof AVM1Key = context.getStaticState(AVM1Key);
		return staticState._lastKeyCode;
	}
}
