import { IDisplayObjectAdapter, IFilter } from '@awayjs/scene';
import { IAVM1Context, AVM1PropertyFlags, alToString, alIsName,
	IAVM1Callable, AVM1DefaultValueHint, alIsFunction } from '../runtime';
import { IAsset } from '@awayjs/core';
import { AVM1Context } from '../context';
import { release, Debug } from '@awayfl/swf-loader';
import { AVM1PropertyDescriptor } from './AVM1PropertyDescriptor';

/**
 * Base class for object instances we prefer to not inherit Object.prototype properties.
 */
export class NullPrototypeObject { }

const DEBUG_PROPERTY_PREFIX = '$Bg';

/**
 * Base class for the ActionScript AVM1 object.
 */
export class AVM1Object extends NullPrototypeObject implements IDisplayObjectAdapter {
	// Using our own bag of properties
	public _ownProperties: any;
	public _prototype: AVM1Object;

	public _avm1Context: IAVM1Context;

	public adaptee: IAsset;
	public avmType: string;
	protected initialDepth: number=0;
	protected scriptRefsToChilds: any={};
	public _eventObserver: AVM1Object;
	public _blockedByScript: boolean;
	public _ctBlockedByScript: boolean;
	public protoTypeChanged: boolean;
	protected _visibilityByScript: boolean;

	// mark that object is GHOST, FP not allow assign/get/call props in this mode, instanceOf always is false
	private _isGhost: boolean = false;

	public get isGhost() {
		return this._isGhost;
	}

	public get eventObserver(): AVM1Object {
		return this._eventObserver;
	}

	public set eventObserver(value: AVM1Object) {
		this._eventObserver = value;
	}

	/**
	 * Move object to ghost mode, we can't recover back from this mode, all props and methods will be undef
	 */
	public makeGhost() {
		// remove all props that was assigned in runtime
		// require for batch3/DarkValentine
		// moved this into this condition. required for chickClick level-button issue
		this.deleteOwnProperties();

		// drop prototype, instanceOf always will false
		this.alPut('__proto__', null);

		this._isGhost = true;
	}

	public dispose(): any {

	}

	public updateFilters(newFilters: IFilter[]) {
		/*let filter: IFilter;
		for (let f = 0; f < newFilters.length; f++) {
			filter = newFilters[f];
		}*/
		// console.warn('[AVM1Object] update_filters not implemented');
	}

	public isBlockedByScript(): boolean {
		return this._blockedByScript;
	}

	public isColorTransformByScript(): boolean {
		return this._ctBlockedByScript;
	}

	public isVisibilityByScript(): boolean {
		return this._visibilityByScript;
	}

	public initAdapter(): void {
	}

	public freeFromScript(): void {
		this.protoTypeChanged = false;
		this._blockedByScript = false;
		this._ctBlockedByScript = false;
		this._visibilityByScript = false;
	}

	public clone() {

		const newAVM1Object: AVM1Object = new AVM1Object(this._avm1Context);
		return newAVM1Object;

	}

	public get context(): AVM1Context { // too painful to have it as IAVM1Context
		return <AVM1Context> this._avm1Context;
	}

	public constructor(avm1Context: IAVM1Context) {
		super();
		this._avm1Context = avm1Context;
		this._ownProperties = Object.create(null);
		this.scriptRefsToChilds = {};
		this._prototype = null;
		this._blockedByScript = false;
		this._ctBlockedByScript = false;
		this._visibilityByScript = false;
		const self = this;
		// Using IAVM1Callable here to avoid circular calls between AVM1Object and
		// AVM1Function during constructions.
		// TODO do we need to support __proto__ for all SWF versions?
		const getter = { alCall: function (thisArg: any, args?: any[]): any { return self.alPrototype; } };
		const setter = { alCall: function (thisArg: any, args?: any[]): any { self.alPrototype = args[0]; } };
		const desc = new AVM1PropertyDescriptor(AVM1PropertyFlags.ACCESSOR |
			AVM1PropertyFlags.DONT_DELETE |
			AVM1PropertyFlags.DONT_ENUM,
		null,
		getter,
		setter);
		this.alSetOwnProperty('__proto__', desc);
	}

	get alPrototype(): AVM1Object {
		return this._prototype;
	}

	set alPrototype(v: AVM1Object) {
		// checking for circular references
		let p = v;
		while (p) {
			if (p === this) {
				return; // possible loop in __proto__ chain is found
			}
			p = p.alPrototype;
		}
		// TODO recursive chain check
		this._prototype = v;
	}

	public alGetPrototypeProperty(): AVM1Object {
		return this.alGet('prototype');
	}

	// TODO shall we add mode for readonly/native flags of the prototype property?
	public alSetOwnPrototypeProperty(v: any): void {
		this.alSetOwnProperty('prototype', new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA |
			AVM1PropertyFlags.DONT_ENUM,
		v));
	}

	public alGetConstructorProperty(): AVM1Object {
		return this.alGet('__constructor__');
	}

	public alSetOwnConstructorProperty(v: any): void {
		this.alSetOwnProperty('__constructor__', new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA |
			AVM1PropertyFlags.DONT_ENUM,
		v));
	}

	_debugEscapeProperty(p: any): string {
		const context = this.context;
		let name = alToString(context, p);
		if (!context.isPropertyCaseSensitive) {
			name = name.toLowerCase();
		}
		return DEBUG_PROPERTY_PREFIX + name;
	}

	public alGetOwnProperty(name): AVM1PropertyDescriptor {
		if (this._isGhost) {
			return null;
		}

		if (typeof name === 'string' && !this.context.isPropertyCaseSensitive) {
			name = name.toLowerCase();
		}
		release || Debug.assert(alIsName(this.context, name));
		// TODO __resolve
		return this._ownProperties[name];
	}

	public alSetOwnProperty(p, desc: AVM1PropertyDescriptor): void {
		if (this._isGhost) {
			return;
		}

		const name = this.context.normalizeName(p);
		if (!desc.originalName && !this.context.isPropertyCaseSensitive) {
			desc.originalName = p;
		}
		if (!release) {
			Debug.assert(desc instanceof AVM1PropertyDescriptor);
			// Ensure that a descriptor isn't used multiple times. If it were, we couldn't update
			// values in-place.
			Debug.assert(!desc['owningObject'] || desc['owningObject'] === this);
			desc['owningObject'] = this;
			// adding data property on the main object for convenience of debugging.
			if ((desc.flags & AVM1PropertyFlags.DATA) &&
				!(desc.flags & AVM1PropertyFlags.DONT_ENUM)) {
				Object.defineProperty(this, this._debugEscapeProperty(name),
					{ value: desc.value, enumerable: true, configurable: true });
			}
		}
		this._ownProperties[name] = desc;
	}

	public alHasOwnProperty(p): boolean  {
		if (this._isGhost) {
			return  false;
		}

		const name = this.context.normalizeName(p);
		return !!this._ownProperties[name];
	}

	public alDeleteOwnProperty(p) {
		const name = this.context.normalizeName(p);
		delete this._ownProperties[name];
		if (!release) {
			delete this[this._debugEscapeProperty(p)];
		}
	}

	public deleteOwnProperties() {
		const allProps = this.alGetOwnPropertiesKeys();
		for (let i = 0;i < allProps.length;i++) {
			this.alDeleteOwnProperty(allProps[i]);
		}
	}

	public alGetOwnPropertiesKeys(): string[] {
		const keys: string[] = [];

		if (this._isGhost) {
			return keys;
		}

		let desc;
		if (!this.context.isPropertyCaseSensitive) {
			for (const name in this._ownProperties) {
				desc = this._ownProperties[name];
				release || Debug.assert('originalName' in desc);
				if (!(desc.flags & AVM1PropertyFlags.DONT_ENUM)) {
					keys.push(desc.originalName);
				}
			}
		} else {
			for (const name in this._ownProperties) {
				desc = this._ownProperties[name];
				if (!(desc.flags & AVM1PropertyFlags.DONT_ENUM)) {
					keys.push(name);
				}
			}
		}
		return keys;
	}

	public alGetProperty(p): AVM1PropertyDescriptor {
		if (this._isGhost) {
			return null;
		}

		const desc = this.alGetOwnProperty(p);
		if (desc) {
			return desc;
		}
		if (!this._prototype) {
			return undefined;
		}
		return this._prototype.alGetProperty(p);
	}

	public alGet(p): any {
		if (this._isGhost) {
			return void  0;
		}

		const name = this.context.normalizeName(p);
		const desc = this.alGetProperty(name);
		if (!desc) {
			return undefined;
		}
		if ((desc.flags & AVM1PropertyFlags.DATA)) {
			// for xml nodes we need to return the nodeValue
			if (desc.value && desc.value.nodeValue)
				return desc.value.nodeValue;

			return desc.value;
		}
		release || Debug.assert((desc.flags & AVM1PropertyFlags.ACCESSOR));
		const getter = desc.get;
		if (!getter) {
			return undefined;
		}
		const value = getter.alCall(this);
		//if(value && value.adaptee && value.adaptee instanceof DisplayObject && !value.adaptee.parent){
		//   return undefined;
		//}
		return value;
	}

	public alCanPut(p): boolean {
		if (this._isGhost) {
			return  false;
		}

		const desc = this.alGetOwnProperty(p);
		if (desc) {
			if ((desc.flags & AVM1PropertyFlags.ACCESSOR)) {
				return !!desc.set;
			} else {
				return !(desc.flags & AVM1PropertyFlags.READ_ONLY);
			}
		}
		const proto = this._prototype;
		if (!proto) {
			return true;
		}
		return proto.alCanPut(p);
	}

	public alPut(p, v) {
		if (this._isGhost) {
			return;
		}

		// Perform all lookups with the canonicalized name, but keep the original name around to
		// pass it to `alSetOwnProperty`, which stores it on the descriptor.
		const originalName = p;
		p = this.context.normalizeName(p);

		// stupid hack to make sure we can update references to objects in cases when the timeline changes the objects
		// if a new object is registered for the same name, we can use the "scriptRefsToChilds"
		// to update all references to the old object with the new one
		if (v && typeof v === 'object'
			&& v.avmType === 'symbol'
			&& p != 'this' && p != '_parent'
			&& !v.dynamicallyCreated) {
			if (v.adaptee && v.adaptee.parent
				&& v.adaptee.parent.adapter
				&& v.adaptee.parent.adapter.scriptRefsToChilds) {
				v.adaptee.parent.adapter.scriptRefsToChilds[v.adaptee.name] = { obj:this, name:p };
			}
		}
		if (!this.alCanPut(p)) {
			return;
		}

		const ownDesc = this.alGetOwnProperty(p);
		if (ownDesc && (ownDesc.flags & AVM1PropertyFlags.DATA)) {

			if (ownDesc.watcher) {
				v = ownDesc.watcher.callback.alCall(this,
					[ownDesc.watcher.name, ownDesc.value, v, ownDesc.watcher.userData]);
			}
			// Real properties (i.e., not things like "_root" on MovieClips) can be updated in-place.
			if (p in this._ownProperties) {
				ownDesc.value = v;
			} else {
				this.alSetOwnProperty(originalName, new AVM1PropertyDescriptor(ownDesc.flags, v));
			}
			return;
		}
		if (typeof v === 'undefined'
			&& (p == '_x' || p == '_y' || p == '_xscale' || p == '_yscale' || p == '_width' || p == '_height')) {
			// certain props do not allow their value to be set to "undefined", so we exit here
			// todo: there might be more props that do not allow "undefined"
			return;
		}
		const desc = this.alGetProperty(p);
		if (desc && (desc.flags & AVM1PropertyFlags.ACCESSOR)) {
			if (desc.watcher) {
				const oldValue = desc.get ? desc.get.alCall(this) : undefined;
				v = desc.watcher.callback.alCall(this,
					[desc.watcher.name, oldValue, v, desc.watcher.userData]);
			}
			const setter = desc.set;
			release || Debug.assert(setter);
			setter.alCall(this, [v]);
		} else {
			if (desc && desc.watcher) {
				release || Debug.assert(desc.flags & AVM1PropertyFlags.DATA);
				v = desc.watcher.callback.alCall(this,
					[desc.watcher.name, desc.value, v, desc.watcher.userData]);
			}
			if (v && v.isTextVar) {
				v = v.value;
				const newDesc = new AVM1PropertyDescriptor(desc ? desc.flags : AVM1PropertyFlags.DATA, v);
				(<any>newDesc).isTextVar = true;
				this.alSetOwnProperty(originalName, newDesc);
			} else {
				const newDesc = new AVM1PropertyDescriptor(desc ? desc.flags : AVM1PropertyFlags.DATA, v);
				this.alSetOwnProperty(originalName, newDesc);
			}

		}
	}

	public alHasProperty(p): boolean  {
		if (this._isGhost) {
			return  false;
		}

		const desc = this.alGetProperty(p);
		return !!desc;
	}

	public alDeleteProperty(p): boolean {
		const desc = this.alGetOwnProperty(p);
		if (!desc) {
			return true;
		}
		if ((desc.flags & AVM1PropertyFlags.DONT_DELETE)) {
			return false;
		}
		this.alDeleteOwnProperty(p);
		return true;
	}

	public alAddPropertyWatcher(p: any, callback: IAVM1Callable, userData: any): boolean {
		if (this._isGhost) {
			return  false;
		}

		// TODO verify/test this functionality to match ActionScript
		const desc = this.alGetProperty(p);
		if (!desc) {
			return false;
		}
		desc.watcher = {
			name: p,
			callback: callback,
			userData: userData
		};
		return true;
	}

	public alRemotePropertyWatcher(p: any): boolean {
		const desc = this.alGetProperty(p);
		if (!desc || !desc.watcher) {
			return false;
		}
		desc.watcher = undefined;
		return true;

	}

	public alDefaultValue(hint: AVM1DefaultValueHint = AVM1DefaultValueHint.NUMBER): any {
		if (hint === AVM1DefaultValueHint.STRING) {
			const toString = this.alGet(this.context.normalizeName('toString'));
			if (alIsFunction(toString)) {
				return toString.alCall(this);
			}
			const valueOf = this.alGet(this.context.normalizeName('valueOf'));
			if (alIsFunction(valueOf)) {
				return valueOf.alCall(this);
			}
		} else {
			release || Debug.assert(hint === AVM1DefaultValueHint.NUMBER);
			const valueOf = this.alGet(this.context.normalizeName('valueOf'));
			if (alIsFunction(valueOf)) {
				return valueOf.alCall(this);
			}
			const toString = this.alGet(this.context.normalizeName('toString'));
			if (alIsFunction(toString)) {
				return toString.alCall(this);
			}
		}
		// TODO is this a default?
		return this;
	}

	public alGetKeys(): string[] {
		if (this._isGhost) {
			return [];
		}

		const ownKeys = this.alGetOwnPropertiesKeys();
		const proto = this._prototype;
		if (!proto) {
			return ownKeys;
		}

		const otherKeys = proto.alGetKeys();
		if (ownKeys.length === 0) {
			return otherKeys;
		}

		// Merging two keys sets
		// TODO check if we shall worry about __proto__ usage here
		const context = this.context;
		let k: number;
		// If the context is case-insensitive, names only differing in their casing overwrite each
		// other. Iterating over the keys returns the first original, case-preserved key that was
		// ever used for the property, though.
		if (!context.isPropertyCaseSensitive) {
			const keyLists = [ownKeys, otherKeys];
			const canonicalKeysMap = Object.create(null);
			const keys = [];
			let keyList;
			let key;
			let canonicalKey;
			for (k = 0; k < keyLists.length; k++) {
				keyList = keyLists[k];
				for (let i = 0; i < keyList.length; i++) {
					key = keyList[i];
					canonicalKey = context.normalizeName(key);
					if (canonicalKeysMap[canonicalKey]) {
						continue;
					}
					canonicalKeysMap[canonicalKey] = true;
					keys.push(key);
				}
			}
			return keys;
		} else {
			const processed = Object.create(null);
			const keyLength1: number = ownKeys.length;
			for (k = 0; k < keyLength1; k++) {
				processed[ownKeys[k]] = true;
			}
			const keyLength2: number = otherKeys.length;
			for (k = 0;  k < keyLength2; k++) {
				processed[otherKeys[k]] = true;
			}
			return Object.getOwnPropertyNames(processed);
		}
	}
}