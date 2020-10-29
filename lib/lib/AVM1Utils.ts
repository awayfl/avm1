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

import { AVM1ActionsData, AVM1Context } from '../context';
import {
	alDefineObjectProperties, AVM1NativeFunction, AVM1PropertyFlags
} from '../runtime';
import { isNullOrUndefined, Debug, release, AVM1ClipEvents } from '@awayfl/swf-loader';
import { AVM1ArrayNative } from '../natives';

import { DisplayObject, TextField, MovieClip, DisplayObjectContainer } from '@awayjs/scene';

import { AVM1SymbolBase } from './AVM1SymbolBase';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Function } from '../runtime/AVM1Function';
import { AVM1PropertyDescriptor } from '../runtime/AVM1PropertyDescriptor';
import { ClipEventMappings, AVM1EventProps, AVM1KeyCodeMap } from './AVM1EventHandler';

export const DEPTH_OFFSET = 16384;

export interface IHasAS3ObjectReference {
	adaptee: any;//80pro ASObject;
}

export interface IAVM1SymbolBase extends IHasAS3ObjectReference{
	context: AVM1Context;
	initAVM1SymbolInstance(context: AVM1Context, awayObject: DisplayObject);
	updateAllEvents();
	getDepth(): number;
}

/**
 * Checks if an object contains a reference to a native AS3 object.
 * Returns false for MovieClip instances or instances of constructors with
 * MovieClip on their prototype chain that were created in script using,
 * e.g. new MovieClip(). Those lack the part of their internal structure
 * that makes them displayable.
 */
export function hasAwayJSAdaptee(obj: any): boolean {
	return !!obj.adaptee;
}

/**
 * Returns obj's reference to a native AS3 object. If the reference
 * does not exist, returns undefined.
 */
export function getAwayJSAdaptee(obj: IHasAS3ObjectReference): any {//80pro} ASObject {
	return obj.adaptee;
}

/**
 * Returns obj's reference to a native AS3 object. If the reference
 * doesn't exist, obj was created in script, e.g. with new MovieClip(),
 * and doesn't reflect a real, displayable display object. In that case,
 * an empty null-proto object is created and returned. This is used for
 * classes that are linked to embedded symbols that extend MovieClip. Their
 * inheritance chain is built by assigning new MovieClip to their prototype.
 * When a proper, displayable, instance of such a class is created via
 * attachMovie, initial values for properties such as tabEnabled
 * can be initialized from values set on the template object.
 */
export function getAwayObjectOrTemplate<T extends DisplayObjectContainer>(obj: AVM1SymbolBase<T>): T {
	if (obj.adaptee) {
		return <T>obj.adaptee;
	}
	// The _as3ObjectTemplate is not really an ASObject type, but we will fake
	// that for AVM1SymbolBase's properties transfers.
	if (!obj._as3ObjectTemplate) {
		let template;
		let proto = obj.alPrototype;
		while (proto && !(<any>proto).initAVM1SymbolInstance) {
			template = (<any>proto)._as3ObjectTemplate;
			if (template) {
				break;
			}
			proto = proto.alPrototype;
		}
		obj._as3ObjectTemplate = Object.create(template || null);
	}
	return <T>obj._as3ObjectTemplate;
}

export const BlendModesMap = [undefined, 'normal', 'layer', 'multiply',
	'screen', 'lighten', 'darken', 'difference', 'add', 'subtract', 'invert',
	'alpha', 'erase', 'overlay', 'hardlight'];

export function avm1HasEventProperty(context: AVM1Context, target: any, propertyName: string): boolean {
	if (target.alHasProperty(propertyName) &&
		(target.alGet(propertyName) instanceof AVM1Function)) {
		return true;
	}
	if (target.alHasProperty(propertyName) &&
    (target._ownProperties[propertyName] &&  target._ownProperties[propertyName].value)) {
		return true;
	}
	const listenersField = target.alGet('_listeners');
	if (!(listenersField instanceof AVM1ArrayNative)) {
		return false;
	}
	const listeners: any[] = listenersField.value;
	return listeners.some(function (listener) {
		return (listener instanceof AVM1Object) && listener.alHasProperty(propertyName);
	});
}

export function avm1BroadcastNativeEvent(
	context: AVM1Context, target: any, propertyName: string, args: any[] = null): void {
	//console.log("avm1BroadcastNativeEvent", propertyName)
	const handler: AVM1Function = target.alGet(propertyName);
	if (handler instanceof AVM1Function) {
		if (propertyName.toLowerCase() == 'onenterframe')	handler.isOnEnter = true;
		context.executeFunction(handler, target, args);
	}
	const _listeners = target.alGet('_listeners');
	if (_listeners instanceof AVM1ArrayNative) {
		let handlerOnListener: AVM1Function = null;
		_listeners.value.forEach(function (listener) {
			if (!(listener instanceof AVM1Object)) {
				return;
			}
			handlerOnListener = listener.alGet(propertyName);
			if (handlerOnListener instanceof AVM1Function) {
				context.executeFunction(handlerOnListener, target, args);
			}
		});
	}
}

export function avm1BroadcastEvent(context: AVM1Context, target: any, propertyName: string, args: any[] = null): void {
	const handler: AVM1Function = target.alGet(propertyName);
	if (handler instanceof AVM1Function) {
		handler.alCall(target, args);
	}
	const _listeners = target.alGet('_listeners');
	if (_listeners instanceof AVM1ArrayNative) {
		let handlerOnListener: AVM1Function = null;
		_listeners.value.forEach(function (listener) {
			if (!(listener instanceof AVM1Object)) {
				return;
			}
			handlerOnListener = listener.alGet(propertyName);
			if (handlerOnListener instanceof AVM1Function) {
				handlerOnListener.alCall(target, args);
			}
		});
	}
}
let myCount = 0;

function createAVM1NativeObject(ctor, nativeObject: DisplayObject, context: AVM1Context) {
	// We need to walk on __proto__ to find right ctor.prototype.
	let template;
	let proto = ctor.alGetPrototypeProperty();
	while (proto && !(<any>proto).initAVM1SymbolInstance) {
		if ((<any>proto)._as3ObjectTemplate && !template) {
			template = (<any>proto)._as3ObjectTemplate;
		}
		proto = proto.alPrototype;
	}
	release || Debug.assert(proto);

	const avm1Object = Object.create(proto);
	(<any>proto).initAVM1SymbolInstance.call(avm1Object, context, nativeObject);
	avm1Object.alPrototype = ctor.alGetPrototypeProperty();
	avm1Object.alSetOwnConstructorProperty(ctor);
	(<any>nativeObject)._as2Object = avm1Object;
	ctor.alCall(avm1Object);

	(<any>avm1Object).aCount = myCount++;
	//	80pro: creating a new _ownProperties
	//  makes sure that newly added properties are added to instance, not to prototype
	//avm1Object._ownProperties={};
	//avm1Object._ownProperties = Object.create(null);

	if (template) {
		// transfer properties from the template
		for (const prop in template) {
			nativeObject[prop] = template[prop];
		}
	}
	return avm1Object;
}

export function getAVM1Object<T extends AVM1Object> (awayObject: DisplayObject, context: AVM1Context): T {
	if (!awayObject) {
		return null;
	}

	if ((<any>awayObject)._as2Object) {
		return (<any>awayObject)._as2Object;
	}
	let avmObject;

	if (awayObject.isAsset(MovieClip)) {
		if ((<MovieClip>awayObject).timeline.isButton) {
			avmObject = <AVM1Object>createAVM1NativeObject(context.globals.Button, awayObject, context);
		} else {
			avmObject = <AVM1Object>createAVM1NativeObject(context.globals.MovieClip, awayObject, context);
		}
	} else if (awayObject.isAsset(TextField)) {
		avmObject = <AVM1Object>createAVM1NativeObject(context.globals.TextField, awayObject, context);
	}
	if (avmObject) {
		(<any>awayObject)._as2Object = avmObject;
		awayObject.adapter = avmObject;
		avmObject.adaptee = awayObject;
	}
	(<any>awayObject)._as2Object = avmObject;
	return avmObject as T;

}

export function wrapAVM1NativeMembers(
	context: AVM1Context, wrap: AVM1Object, obj: any, members: string[], prefixFunctions: boolean = false): void  {
	function wrapFunction(fn) {
		if (isNullOrUndefined(fn)) {
			return undefined;
		}
		release || Debug.assert(typeof fn === 'function');
		if (!prefixFunctions) {
			return new AVM1NativeFunction(context, fn);
		}
		return new AVM1NativeFunction(context, function () {
			const args = Array.prototype.slice.call(arguments, 0);
			args.unshift(context);
			return fn.apply(this, args);
		});
	}
	function getMemberDescriptor(memberName): PropertyDescriptor {
		let desc;
		for (let p = obj; p; p = Object.getPrototypeOf(p)) {
			desc = Object.getOwnPropertyDescriptor(p, memberName);
			if (desc) {
				return desc;
			}
		}
		return null;
	}

	if (!members) {
		return;
	}
	members.forEach(function (memberName) {
		if (memberName[memberName.length - 1] === '#') {
			// Property mapping
			const getterName = 'get' + memberName[0].toUpperCase() + memberName.slice(1, -1);
			const getter = obj[getterName];
			const setterName = 'set' + memberName[0].toUpperCase() + memberName.slice(1, -1);
			const setter = obj[setterName];
			release || Debug.assert(getter || setter, 'define getter or setter');
			const desc = new AVM1PropertyDescriptor(AVM1PropertyFlags.ACCESSOR |
				AVM1PropertyFlags.DONT_DELETE |
				AVM1PropertyFlags.DONT_ENUM,
			null, wrapFunction(getter), wrapFunction(setter));
			wrap.alSetOwnProperty(memberName.slice(0, -1), desc);
			return;
		}

		const nativeDesc = getMemberDescriptor(memberName);
		if (!nativeDesc) {
			return;
		}
		if (nativeDesc.get || nativeDesc.set) {
			release || Debug.assert(false, 'Redefine ' + memberName + ' property getter/setter as functions');
			return;
		}

		let value = nativeDesc.value;
		if (typeof value === 'function') {
			value = wrapFunction(value);
		}
		const desc = new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA |
			AVM1PropertyFlags.DONT_DELETE |
			AVM1PropertyFlags.DONT_ENUM,
		value);
		wrap.alSetOwnProperty(memberName, desc);
	});
}

export function wrapAVM1NativeClass(
	context: AVM1Context, wrapAsFunction: boolean, cls: typeof AVM1Object,
	staticMembers: string[], members: string[], call?: Function, cstr?: Function): AVM1Object  {
	const wrappedFn = wrapAsFunction ?
		new AVM1NativeFunction(context, call || function () { }, function () {
			// Creating simple AVM1 object
			const obj = new cls(context);
			obj.alPrototype = wrappedPrototype;
			obj.alSetOwnConstructorProperty(wrappedFn);
			if (cstr) {
				cstr.apply(obj, arguments);
			}
			return obj;
		}) :
		new AVM1Object(context);
	wrapAVM1NativeMembers(context, wrappedFn, cls, staticMembers, true);
	const wrappedPrototype = new cls(context);
	wrappedPrototype.alPrototype = context.builtins.Object.alGetPrototypeProperty();
	wrapAVM1NativeMembers(context, wrappedPrototype, cls.prototype, members, false);
	alDefineObjectProperties(wrappedFn, {
		prototype: {
			value: wrappedPrototype
		}
	});
	alDefineObjectProperties(wrappedPrototype, {
		constructor: {
			value: wrappedFn,
			writable: true
		}
	});
	return wrappedFn;
}

export function initializeAVM1Object(
	awayObject: any, context: AVM1Context, placeObjectTag: any) {
	const instanceAVM1 = <AVM1SymbolBase<DisplayObjectContainer>>getAVM1Object(awayObject, context);
	release || Debug.assert(instanceAVM1);

	if (placeObjectTag.variableName) {
		instanceAVM1.alPut('variable', placeObjectTag.variableName);
	}

	const events = placeObjectTag.events;
	if (!events) {
		return;
	}
	let swfEvent;
	let actionsData;
	let handler;
	let flags;
	let eventFlag;
	let eventMapping;
	let eventName;
	let eventProps = null;
	for (let j = 0; j < events.length; j++) {
		swfEvent = events[j];
		actionsData;
		if (swfEvent.actionsBlock) {
			actionsData = context.actionsDataFactory.createActionsData(
				swfEvent.actionsBlock,'s' + placeObjectTag.symbolId + 'd' + placeObjectTag.depth + 'e' + j);
			swfEvent.actionsBlock = null;
			swfEvent.compiled = actionsData;
		} else {
			actionsData = swfEvent.compiled;
		}
		release || Debug.assert(actionsData);
		handler = clipEventHandler.bind(null, actionsData, instanceAVM1);
		flags = swfEvent.flags;
		for (const key in ClipEventMappings) {
			eventFlag = parseInt(key);
			eventFlag |= 0;
			if (!(flags & (eventFlag | 0))) {
				continue;
			} else if (eventFlag == AVM1ClipEvents.Construct) {
				awayObject.onConstruct = handler;
				continue;
			} else if (eventFlag == AVM1ClipEvents.Initialize) {
				awayObject.onInitialize = handler;
				continue;
			} else if (eventFlag == AVM1ClipEvents.Load) {
				awayObject.onLoaded = handler;
				continue;
			}

			eventMapping = ClipEventMappings[eventFlag];
			eventName = eventMapping.eventName;
			//console.log("eventName", eventName, eventMapping, eventFlag, swfEvent);
			if (!eventName) {
				Debug.warning('ClipEvent: ' + eventFlag + ' not implemented');
				continue;
			}
			if (swfEvent.keyCode) {
				eventProps = new AVM1EventProps();
				eventProps.keyCode = swfEvent.keyCode;
				if (swfEvent.keyCode < 32 &&	AVM1KeyCodeMap[swfEvent.keyCode])
					eventProps.keyCode = AVM1KeyCodeMap[swfEvent.keyCode];
			}
			instanceAVM1._addOnClipEventListener(eventMapping, handler, eventProps);
		}
	}
}

export function toTwipFloor(value: number): number {
	// in theory this should do:
	//return Math.round(value*20)/20;
	// because AwayJS does not use big.js internally, floats might have this nasty rounding error
	// we need to floor twips, and add a additional twip in case it had the floating error
	const isNeg = value < 0 ? -1 : 1;
	value = Math.abs(value);
	let twip: number = Math.floor(value * 20) / 20;
	if (value > twip && (value - twip) > 0.04) {
		twip += 0.05;
		// the addition might introduce float issue again,
		// so make sure go back to twips
		twip = Math.round(twip * 20) / 20;
	}
	return twip * isNeg;

}
export function toTwipRound(value: number): number {
	return Math.round(value * 20) / 20;

}
export function avm2AwayDepth(value: number): number {
	return value + 1;
}
export function away2avmDepth(value: number): number {
	return value - 1;
}
function clipEventHandler(actionsData: AVM1ActionsData, receiver: IAVM1SymbolBase) {
	return receiver.context.executeActions(actionsData, receiver);
}
