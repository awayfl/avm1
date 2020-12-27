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

//module Shumway.AVM1 {
//import flash = flash;
import { AVM1Movie } from './AVM1Movie';

import { AnalyzerResults } from './analyze';
import { alCoerceString, alToString, IAVM1Builtins, IAVM1Context } from './runtime';
import { AVM1Globals } from './lib/AVM1Globals';
import { installBuiltins } from './natives';
import { MapObject, Debug, release, assert, AVMStage } from '@awayfl/swf-loader';
import { AVM1Key } from './lib/AVM1Key';
import { AVM1Mouse } from './lib/AVM1Mouse';
import { AVM1Stage } from './lib/AVM1Stage';
import { AVM1MovieClip } from './lib/AVM1MovieClip';
import { getAVM1Object } from './lib/AVM1Utils';
import { AVM1Object } from './runtime/AVM1Object';
import { AVM1Function } from './runtime/AVM1Function';
import { AssetLibrary } from '@awayjs/core';
import { SecurityDomain } from './SecurityDomain';
import { AVM1Handler } from './AVM1Handler';

//import {WeakMap} from "es6-weak-map";
//import {Map} from "es6-map";

interface IEncryptedActionData {
	data: Uint8Array,
	size: ui32,
	bytePos: ui32,
	rawTagId: ui8
}

export class AVM1ActionsData {
	public ir: AnalyzerResults;
	public compiled: Function;
	public debugPath: string = this.id;

	constructor(
		public bytes: Uint8Array,
		public id: string,
		public parent: AVM1ActionsData = null,
		public encryptedData?: IEncryptedActionData) {
		this.ir = null;
		this.compiled = null;
	}
}

export interface AVM1ExportedSymbol {
	symbolId: number;
	symbolProps;
}

export interface IAVM1RuntimeUtils {
	hasProperty(obj, name): boolean;
	getProperty(obj, name): any;
	setProperty(obj, name, value): void;
	warn(msg: string): void;
}

export interface IAVM1EventPropertyObserver {
	onEventPropertyModified(name: string);
}

interface IActonBlock {
	actionsData: Uint8Array;
	encryptedData: any;
}

export class ActionsDataFactory {
	private _cache: WeakMap<Uint8Array, AVM1ActionsData> = new WeakMap<Uint8Array, AVM1ActionsData>();
	public createActionsData(actionData: Uint8Array | IActonBlock, id: string,
		parent: AVM1ActionsData = null): AVM1ActionsData {

		const isArray = (actionData instanceof Uint8Array);

		const bytes: Uint8Array = isArray ? <Uint8Array>actionData : (<IActonBlock>actionData).actionsData;
		const encryptedData = isArray ? undefined : (<IActonBlock>actionData).encryptedData;
		let actionsData = this._cache.get(bytes);

		if (!actionsData) {
			actionsData = new AVM1ActionsData(bytes, id, parent, encryptedData);
			this._cache.set(bytes, actionsData);
		}

		release || assert(actionsData.bytes === actionData && actionsData.id === id && actionsData.parent === parent);
		return actionsData;
	}
}

export class AVM1Context implements IAVM1Context {
	public sec: SecurityDomain;
	public globals: AVM1Globals;
	public builtins: IAVM1Builtins;
	public isPropertyCaseSensitive: boolean;
	public actionsDataFactory: ActionsDataFactory;
	public swfVersion: number;
	public levelsContainer: AVM1Movie;

	private eventObservers: MapObject<IAVM1EventPropertyObserver[]>;
	private assets: MapObject<number>;
	private awayAssets: any;
	private assetsSymbols: Array<any>;
	private assetsClasses: Array<any>;
	private staticStates: WeakMap<typeof AVM1Object, any>;

	constructor(swfVersion: number) {
		this.swfVersion = swfVersion;
		this.globals = null;
		this.actionsDataFactory = new ActionsDataFactory();
		if (swfVersion > 6) {
			this.isPropertyCaseSensitive = true;
			this.normalizeName = this.normalizeNameCaseSensitive;
		} else {
			this.isPropertyCaseSensitive = false;
			this._nameCache = Object.create(null);
			this.normalizeName = this.normalizeNameCaseInsensitive;
		}

		this.builtins = <any>{};
		installBuiltins(this);

		this.eventObservers = Object.create(null);
		this.assets = {};
		this.assetsSymbols = [];
		this.assetsClasses = [];
		this.awayAssets = {};
		this.staticStates = new WeakMap<typeof AVM1Object, any>();
	}

	public utils: IAVM1RuntimeUtils;

	public static create: (swfVersion: number) => AVM1Context;

	public resolveTarget(target): any { }
	public resolveRoot(): any { }
	public checkTimeout() { }

	public executeActions(actionsData: AVM1ActionsData, scopeObj): void { }
	public executeFunction(fn: AVM1Function, thisArg, args: any): any { }

	/**
	 * Normalize the name according to the current AVM1Context's settings.
	 *
	 * This entails coercing it to number or string. For SWF versions < 7, it also means converting
	 * it to lower-case.
	 * To avoid runtime checks, the implementation is set during context initialization based on
	 * the SWF version.
	 */
	public normalizeName: (name) => string;

	private normalizeNameCaseSensitive(name: any): string {
		switch (typeof name) {
			case 'number':
			case 'string':
				return <string>name;
			default:
				return alToString(this, name);
		}
	}

	private _nameCache: Map<string, string>;
	private normalizeNameCaseInsensitive(name: any): string {
		switch (typeof name) {
			case 'number':
				return name.toString();
			case 'string':
				break;
			default:
				name = alToString(this, name);
		}
		let normalizedName = this._nameCache[name];
		if (normalizedName) {
			return normalizedName;
		}
		normalizedName = name.toLowerCase();
		this._nameCache[name] = normalizedName;
		return normalizedName;
	}

	private _getEventPropertyObservers(propertyName: string, create: boolean): IAVM1EventPropertyObserver[] {
		if (!this.isPropertyCaseSensitive) {
			propertyName = propertyName.toLowerCase();
		}
		let observers = this.eventObservers[propertyName];
		if (observers) {
			return observers;
		}
		if (create) {
			observers = [];
			this.eventObservers[propertyName] = observers;
			return observers;
		}
		return null;
	}

	public registerEventPropertyObserver(propertyName: string, observer: IAVM1EventPropertyObserver): void {
		const observers = this._getEventPropertyObservers(propertyName, true);
		observers.push(observer);
	}

	public unregisterEventPropertyObserver(propertyName: string, observer: IAVM1EventPropertyObserver): void {
		const observers = this._getEventPropertyObservers(propertyName, false);
		if (!observers) {
			return;
		}
		const j = observers.indexOf(observer);
		if (j < 0) {
			return;
		}
		observers.splice(j, 1);
	}

	public broadcastEventPropertyChange(propertyName: string): void {
		const observers = this._getEventPropertyObservers(propertyName, false);
		if (!observers) {
			return;
		}
		observers.forEach((observer: IAVM1EventPropertyObserver) => observer.onEventPropertyModified(propertyName));
	}

	public addAsset(className: string, symbolId: number, symbolProps: any): void {
		//console.log("addAsset", className, symbolId, symbolProps);
		release || Debug.assert(typeof className === 'string' && !isNaN(symbolId));
		this.assets[className.toLowerCase()] = symbolId;
		this.assetsSymbols[symbolId] = symbolProps;
		//80pro: directly store assets in dictionary
		this.awayAssets[className.toLowerCase()] = symbolProps;
	}

	public registerClass(className: string, theClass: AVM1Object): void {
		className = alCoerceString(this, className);
		if (className === null) {
			this.utils.warn('Cannot register class for symbol: className is missing');
			return;
		}
		const myAsset: any = AssetLibrary.getAsset(className, AVM1MovieClip.currentMCAssetNameSpace);
		if (!myAsset || !myAsset.adaptee) {
			console.warn('can not find symbol to register class ' + className);
			return;
		}
		//console.log("register", myAsset.adaptee.name, myAsset.adaptee.id);
		(<any>myAsset.adaptee).avm1Symbol = theClass;
		/*
		var symbolId = this.assets[className.toLowerCase()];
		if (symbolId === undefined) {
			this.utils.warn('Cannot register ' + className + ' class for symbol');
			return;
		}
		this.assetsClasses[symbolId] = theClass;*/
	}

	public getSymbolClass(symbolId: number): AVM1Object {
		return this.assetsClasses[symbolId] || null;
	}

	public getAsset(className: string): AVM1ExportedSymbol {
		className = alCoerceString(this, className);
		if (className === null) {
			return undefined;
		}

		const symbolId = this.assets[className.toLowerCase()];
		if (symbolId === undefined) {
			return undefined;
		}
		const symbol = this.awayAssets[className.toLowerCase()];
		if (!symbol) {
			console.log('error in getAsset. not implemented to grab assets from loaderInfo');
			/*symbol = this.loaderInfo.getSymbolById(symbolId);
			if (!symbol) {
				Debug.warning("Symbol " + symbolId + " is not defined.");
				return undefined;
			}
			this.assetsSymbols[symbolId] = symbol;*/
		}
		return {
			symbolId: symbolId,
			symbolProps: symbol
		};
	}

	public reset(): void {

		this.eventObservers = Object.create(null);
		this.assets = {};
		this.assetsSymbols = [];
		this.assetsClasses = [];
		this.awayAssets = {};
		this.staticStates = new WeakMap<typeof AVM1Object, any>();
		AVM1Stage.bindStage(this, this.globals.Stage, null, null, null);

	}

	private htmlElement: any;
	public setStage(avmStage: AVMStage, avm1Handler: AVM1Handler, htmlElement: any): void {
		AVM1Key.bindStage(this, this.globals.Key, avmStage, htmlElement);
		AVM1Mouse.bindStage(this, this.globals.Mouse, avmStage, htmlElement);
		AVM1Stage.bindStage(this, this.globals.Stage, avmStage, avm1Handler, htmlElement);
	}

	public getStaticState(cls): any {
		let state = this.staticStates.get(cls);
		if (!state) {
			state = Object.create(null);
			const initStatic: Function = (<any>cls).alInitStatic;
			if (initStatic) {
				initStatic.call(state, this);
			}
			this.staticStates.set(cls, state);
		}
		return state;
	}

	public resolveLevel(level: number): AVM1MovieClip {
		release || Debug.assert(typeof level === 'number');
		const as3Root = this.globals._getRootForLevel(level);
		if (!as3Root) {
			this.utils.warn('Unable to resolve level ' + level + ' root');
			return undefined;
		}
		return <AVM1MovieClip>getAVM1Object(as3Root, this);
	}
}
