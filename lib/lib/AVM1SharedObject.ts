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


import { AVM1PropertyDescriptor } from "../runtime/AVM1PropertyDescriptor";
import {
	alIsArray, AVM1PropertyFlags, alCoerceString, alDefineObjectProperties, alNewObject, alToBoolean
} from "../runtime";
import {wrapAVM1NativeClass} from "./AVM1Utils";
import {AVM1Context} from "../context";
import {AVM1Object} from "../runtime/AVM1Object";
import { AVM1ArrayNative } from "../natives";

interface IStorage {
	getItem(key: string): string;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

let _sharedObjectStorage: IStorage;

class VirtualStorage implements IStorage {
	_values: StringMap<string> = {};
	_realStorage: IStorage = null;
	
	getItem(key: string) {
		if(this._realStorage) {
			this._values[key] = this._realStorage.getItem(key);
		}
		return this._values[key];
	}

	setItem(key: string, value: string) {
		if(this._realStorage) {
			this._realStorage.setItem(key, value);
		}
		this._values[key] = value;
	}

	removeItem(key: string) {
		if(this._realStorage) {
			this._realStorage.removeItem(key);
		}
		delete this._values[key];
	}
}

export function getSharedObjectStorage(): IStorage {
	if (!_sharedObjectStorage) {
		_sharedObjectStorage = new VirtualStorage();
	
		if(typeof Storage !== 'undefined') {
			try{
				(_sharedObjectStorage as VirtualStorage)._realStorage = window.localStorage;
			} catch(e) {
				console.warn("[Shared Storage] ", e);
			}
		}
	}
	return _sharedObjectStorage;
}

export class SharedObjectDebug {
	public static _lastRawData: any = null;
	
	public static decodedData() {
		const values = (<VirtualStorage>getSharedObjectStorage())._values;
		const raw = {};
		
		for(let key in values) {
			raw[key] = JSON.parse(values[key]);
		}

		this._lastRawData = raw;
		return raw;
	}

	public static encodeAndApplyData(): any {
		if(!this._lastRawData) {
			throw "Need call decode before encode for detecting a model";
		}

		const store = <VirtualStorage>getSharedObjectStorage();

		for(let key in this._lastRawData) {
			store.setItem(key, JSON.stringify(this._lastRawData[key]));
		}

		return store._values;
	}
}

export class AVM1SharedObject extends AVM1Object {
	static createAVM1Class(context: AVM1Context): AVM1Object {
		return wrapAVM1NativeClass(context, true, AVM1SharedObject,
			['getLocal'],
			
			['data#', 'flush', 'clear']);
	}
	private _data:AVM1Object;
	private _storage_name:string;
	private _flushPending: number = 0;
	private _bindedFlush: Function;

	constructor(context: AVM1Context) {
		super(context);
		alDefineObjectProperties(this, {
			data: {
				get: this.getData,
				enumerable: true,
			},
			clear: {
				value: this.clear,
				writable: true
			},
			flush: {
				value: this.flush,
				writable: true
			}
		});

		this._bindedFlush = this.flush.bind(this);
	}

	public setName(name:string){

		name = alCoerceString(this.context, name);

		this._storage_name=name;

		if(typeof(Storage) !== "undefined") {
			const jsData = JSON.parse(getSharedObjectStorage().getItem(name));
			if( jsData ){
				this._data = this.getAVM1Value(jsData);
				return;
			}
		}
		
		this._data = alNewObject(this.context);

		console.log("no shared object found");
		return null;//context.sec.flash.external.ExternalInterface.axClass.available;
	}
	
	
	public static getLocal(context:AVM1Context, name: string, localPath?: string, secure?: boolean): AVM1SharedObject {
		if(localPath || secure){
			console.warn("SharedObject.getLocal: params 'localPath' and 'secure' not supported")
		}
		//localPath = alCoerceString(this.context, localPath);
		//secure = alToBoolean(this.context, secure);
		var newSharedObj=new AVM1SharedObject(context);
		newSharedObj.setName(name);
		return newSharedObj;
	}
	
	private applyDataHook(data: AVM1Object) {
		if(data["__alPutHookApplyed"]) {
			return data;
		}

		data["__alPutHookApplyed"] = true;
		data.alPut = (p: any, v: any) => {
			AVM1Object.prototype.alPut.call(data, p, v);
			this.requestFlush();
		}

		return data;
	}

	private requestFlush() {
		clearTimeout(this._flushPending);

		this._flushPending = setTimeout(this._bindedFlush, 100);
	}

	public getData(): any {
		return this.applyDataHook(this._data);
	}

	public clear(): void {
		localStorage.removeItem(this._storage_name);
	}

	private getAVM1Value(jsValue:any):any{
		if( typeof jsValue  ==="number" || typeof jsValue  ==="string" || typeof jsValue  ==="boolean"){
			return jsValue;
		}
		if(Array.isArray(jsValue)){
			for(var i=0; i<jsValue.length;i++){
				jsValue[i]=this.getAVM1Value(jsValue[i]);
			}
			return new AVM1ArrayNative(this.context, jsValue);
		}
		if( typeof jsValue  ==="object"){
			var newAVM1Obj=alNewObject(this.context);
			for(var key in jsValue){
				newAVM1Obj.alSetOwnProperty(key, new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA,
					this.getAVM1Value(jsValue[key])));
			}
			return newAVM1Obj;
		}
	}
	private getJSValue(avm1value:any){
		if( typeof avm1value  ==="number" || typeof avm1value  ==="string" || typeof avm1value  ==="boolean"){
			return avm1value;
		}
		
		if(alIsArray(this.context, avm1value)){
			console.log("array");
			var jsArray=avm1value.value;	
			var arr=[];	
			if(jsArray){	
				var arrLength:number=jsArray.length;
				for(var i=0; i< arrLength; i++){
					arr[i]=this.getJSValue(jsArray[i]);
				}
			}
			return arr;
		}
		if( avm1value instanceof AVM1Object){

			var jsValue={};
			for(var key in avm1value._ownProperties){
				if(key!="__proto__" && key !="__constructor__"){
					jsValue[key]=this.getJSValue(avm1value._ownProperties[key].value);		
				}		
			}
			return jsValue;
		}
		console.log("unknown datatype");
	}

	public flush(minDiskSpace?: number): string | boolean {
		if(this._flushPending) {
			clearTimeout(this._flushPending);
			this._flushPending = null;
		}

		//minDiskSpace = alCoerceNumber(this.context, minDiskSpace);
		//this._as3SharedObject.flush(minDiskSpace);
		var jsValue=this.getJSValue(this._data);
		getSharedObjectStorage().setItem(this._storage_name, JSON.stringify(jsValue));
		return false; // can be a string 'pending' or boolean
	}
}

/*
export class AVM1SharedObjectFunction extends AVM1Function {
	constructor(context: AVM1Context) {
		super(context);
		alDefineObjectProperties(this, {
			prototype: {
				value: new AVM1SharedObjectPrototype(context, this)
			},
			getLocal: {
				value: this.getLocal,
				writable: true
			}
		});
	}

	public getLocal(name: string, localPath?: string, secure?: boolean): AVM1SharedObject {
		name = alCoerceString(this.context, name);
		if(localPath || secure){
			console.warn("SharedObject.getLocal: params 'localPath' and 'secure' not supported")
		}
		//localPath = alCoerceString(this.context, localPath);
		//secure = alToBoolean(this.context, secure);
		return new AVM1SharedObject(this.context, name);
	}

}

export class AVM1SharedObjectPrototype extends AVM1Object {
	constructor(context: AVM1Context, fn: AVM1Function) {
		super(context);
		this.alPrototype = context.builtins.Object.alGetPrototypeProperty();
		alDefineObjectProperties(this, {
			constructor: {
				value: fn,
				writable: true
			},
			data: {
				get: this.getData
			},
			clear: {
				value: this.clear,
				writable: true
			},
			flush: {
				value: this.flush,
				writable: true
			}
		})
	}

	private _as3SharedObject: SharedObject; // mirror of AVM1SharedObject's one

	public getData(): any {
		// TODO implement transform from AVM2 -> AVM1 objects
		Debug.somewhatImplemented('AVM1SharedObject.getData');
		var data = (<any>this).__data || ((<any>this).__data = alNewObject(this.context));
		return data;
	}

	public clear(): void {
		this._as3SharedObject.clear();
	}

	public flush(minDiskSpace?: number): any {
		minDiskSpace = alCoerceNumber(this.context, minDiskSpace);
		this._as3SharedObject.flush(minDiskSpace);
		Debug.somewhatImplemented('AVM1SharedObject.flush');
		return false; // can be a string 'pending' or boolean
	}

	public getSize(): number {
		Debug.somewhatImplemented('AVM1SharedObject.getSize');
		return (<any>this).__data ? 10 : 0;
	}

	public setFps(updatesPerSecond: number) : boolean {
		updatesPerSecond = alCoerceNumber(this.context, updatesPerSecond) || 0;
		this._as3SharedObject.fps = updatesPerSecond;
		return this._as3SharedObject.fps === updatesPerSecond;
	}
}

// TODO event handlers for
// onStatus(infoObject: AVM1Object)
// onSync(objArray: AVM1Array)

*/