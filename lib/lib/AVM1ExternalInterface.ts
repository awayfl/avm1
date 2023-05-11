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
import { alCoerceString, alIsFunction } from '../runtime';
import { wrapAVM1NativeClass } from './AVM1Utils';
import { AVM1Context } from '../context';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Function } from '../runtime/AVM1Function';

//module Shumway.AVM1.Lib {

export class AVM1ExternalInterface extends AVM1Object {
	static createAVM1Class(context: AVM1Context): AVM1Object {
		return wrapAVM1NativeClass(context, true, AVM1ExternalInterface,
			['available#', 'addCallback', 'call'],
			[]);
	}

	public static getAvailable(context: AVM1Context): boolean {
		return true;//context.sec.flash.external.ExternalInterface.axClass.available;
	}

	public static addCallback(context: AVM1Context, methodName: string, instance: any, method: AVM1Function): boolean {
		methodName = alCoerceString(context, methodName);
		if (!alIsFunction(method)) {
			return false;
		}
		try {
			if (!window['flashObject']) {
				window['flashObject'] = {};
			}
			window['flashObject'][methodName] = function(...args) {

				const desc = instance.alGet(methodName.toLowerCase());
				if (desc && alIsFunction(desc))
					desc.alCall(instance, args);
				else if (desc && desc.value)
					desc.value.alCall(instance, args);
				//_this.mwAdaptee.runScripts();

			};
			/*context.sec.flash.external.ExternalInterface.axClass.addCallback(methodName, function () {
				var args = Array.prototype.slice.call(arguments, 0);
				var result = context.executeFunction(method, instance, args);
				return result;
			});*/
			return true;
		} catch (e) {
			console.warn('[AVM1ExternalInterface] - error in addCallback', e);
		}
		return false;
	}

	public static call(context: AVM1Context, methodName: string, ...parameters: any[]): any {
		const args = [];// [alCoerceString(context, methodName)];
		const paramsLength: number = parameters.length;
		let i: number = 0;

		try {
			const methodnames = methodName.split('.');
			let method: any = window;
			for (i = 0; i < methodnames.length; i++) {
				method = method[methodnames[i]];
			}

			// TODO convert AVM2 result to AVM1
			return method.apply(window, parameters);
		} catch (e) {
			return undefined;
		}
	}
}
