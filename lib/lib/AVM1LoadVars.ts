/**
 * Copyright 2015 Mozilla Foundation
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

import { Debug, notImplemented, release, isNullOrUndefined, matchRedirect } from '@awayfl/swf-loader';

import { AVM1Context } from '../context';
import {
	alCoerceString, alDefineObjectProperties, alToString
} from '../runtime';
import { avm1BroadcastEvent } from './AVM1Utils';
import { URLLoaderEvent as Event, URLLoader, URLRequest, URLVariables } from '@awayjs/core';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Function } from '../runtime/AVM1Function';

export interface IAVM1DataObject {
	isAVM1DataObject: boolean;
	_as3Loader: URLLoader;
	getBytesLoaded(): number;
	getBytesTotal(): number;
}

export function loadAVM1DataObject(
	context: AVM1Context,
	url: string,
	method: string,
	contentType: string,
	data: string,
	target: IAVM1DataObject
): void {

	const request = new URLRequest(url);
	const directUrl = request.url || '';
	const cleanUrl = directUrl.replace(/\?.*$/, '');
	const redirect = matchRedirect(directUrl, null);

	if (redirect) {
		if (redirect.supressLoad) {
			console.log('[LOADER] Load supressed ', redirect.url);
			return;

		}
		console.log('[LOADER] Override loading url:', redirect.url);
		request.url = redirect.url;
	} else {
		console.log('[LOADER] start loading the url:', cleanUrl);
	}

	if (method) {
		request.method = method;
	}

	if (contentType) {
		//request.contentType = contentType;
	}

	if (data) {
		release || Debug.assert(typeof data === 'string');
		// generate valid payload
		request.data = contentType === 'application/x-www-form-urlencoded'
			? new URLVariables(data)
			: data;
	}

	const loader = new URLLoader();

	loader.dataFormat = 'text'; // flash.net.URLLoaderDataFormat.TEXT;

	const completeHandler = function (event: Event): void {
		loader.removeEventListener(Event.LOAD_COMPLETE, completeHandler);
		release || Debug.assert(typeof loader.data === 'string');
		avm1BroadcastEvent(context, target, 'onData', [loader.data]);
	};

	loader.addEventListener(Event.LOAD_COMPLETE, completeHandler);
	target._as3Loader = loader;

	if (redirect && redirect.supressErrors) {
		loader.addEventListener(Event.LOAD_ERROR, (event: Event)=>{
			console.log('[LOADER] Error supressed by redirect rule as empty complete events!', event);
			loader.dispatchEvent(new Event(Event.LOAD_COMPLETE, loader));
		});
	}

	loader.load(request);
}

export class AVM1LoadVarsFunction extends AVM1Function {
	constructor(context: AVM1Context) {
		super(context);
		this.alSetOwnPrototypeProperty(new AVM1LoadVarsPrototype(context, this));
	}

	alConstruct(args?: any[]): AVM1Object  {
		const obj = new AVM1Object(this.context);
		obj.alPrototype = this.alGetPrototypeProperty();
		(<IAVM1DataObject><any>obj).isAVM1DataObject = true;
		return obj;
	}

	alCall(thisArg: any, args?: any[]): any {
		return this.alConstruct(args);
	}
}

export class AVM1LoadVarsPrototype extends AVM1Object implements IAVM1DataObject {
	constructor(context: AVM1Context, fn: AVM1LoadVarsFunction) {
		super(context);
		alDefineObjectProperties(this, {
			constructor: {
				value: fn,
				writable: true
			},
			toString: {
				value: this._toString
			},
			load: {
				value: this.load
			},
			onData: {
				value: this.defaultOnData
			},
			decode: {
				value: this.decode
			},
			send: {
				value: this.load
			},
			sendAndLoad: {
				value: this.sendAndLoad
			}
		});
	}

	isAVM1DataObject: boolean;
	_as3Loader: URLLoader;

	getBytesLoaded(): number {
		if (!this._as3Loader) {
			return undefined;
		}
		return this._as3Loader.bytesLoaded;
	}

	getBytesTotal(): number {
		if (!this._as3Loader) {
			return undefined;
		}
		return this._as3Loader.bytesTotal;
	}

	load(url: string): boolean {
		url = alCoerceString(this.context, url);
		if (!url) {
			return false;
		}

		loadAVM1DataObject(this.context, url, null, null, null, this);
		return true;
	}

	defaultOnData(src: string) {
		if (isNullOrUndefined(src)) {
			avm1BroadcastEvent(this.context, this, 'onLoad', [false]);
			return;
		}
		AVM1LoadVarsPrototype.prototype.decode.call(this, src);
		this.alPut('loaded', true);
		avm1BroadcastEvent(this.context, this, 'onLoad', [true]);
	}

	decode(queryString: string): void {
		queryString = alCoerceString(this.context, queryString);
		/*var as3Variables = new URLVariables();
		as3Variables._ignoreDecodingErrors = true;
		as3Variables.decode(queryString);
		forEachPublicProperty(as3Variables, function (name, value) {
			// TODO Are we leaking some AS3 properties/fields here?
			if (typeof value === 'string') {
				this.alPut(name, value);
			}
		}, this);*/
	}

	_toString(): string {
		const payload: Record<string, string> = {};

		for (const key in this._ownProperties) {
			payload[key] = this.alGet(key);
		}

		return (new URLSearchParams(payload)).toString();
	}

	send(url: string, target: string, method?: string): boolean {
		url = alCoerceString(this.context, url);
		method = isNullOrUndefined(method) ? 'POST' : alCoerceString(this.context, method);
		notImplemented('AVM1LoadVarsPrototype.send');
		return false;
	}

	sendAndLoad(url: string, target: AVM1Object, method?: string): boolean {
		url = alCoerceString(this.context, url);
		method = isNullOrUndefined(method) ? 'POST' : alCoerceString(this.context, method);
		if (!url || !(target instanceof AVM1Object)) {
			return false;
		}
		if (!(<IAVM1DataObject><any>target).isAVM1DataObject) {
			return false;
		}
		let contentType = this.alGet('contentType');

		contentType = isNullOrUndefined(contentType) ?
			'application/x-www-form-urlencoded' :
			alCoerceString(this.context, contentType);

		const data = alToString(this.context, this);

		loadAVM1DataObject(
			this.context,
			url,
			method,
			contentType,
			data,
			<IAVM1DataObject><any>target
		);

		return true;
	}
}
