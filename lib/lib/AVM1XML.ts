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

import {
	alCoerceNumber, alCoerceString, alDefineObjectProperties, alForEachProperty, alInstanceOf, alIsIndex, alToBoolean,
	alToInteger, alToString,
	AVM1PropertyFlags
} from '../runtime';
import { Debug, release, isNullOrUndefined } from '@awayfl/swf-loader';
import { IAVM1DataObject, loadAVM1DataObject } from './AVM1LoadVars';
import { avm1BroadcastEvent } from './AVM1Utils';
import { XMLNode } from '../customAway/xml/XMLNode';
import { XMLDocumentAway } from '../customAway/xml/XMLDocumentAway';
import { URLLoader } from '@awayjs/core';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Function } from '../runtime/AVM1Function';
import { AVM1PropertyDescriptor } from '../runtime/AVM1PropertyDescriptor';

enum AVM1XMLNodeType {
	ELEMENT_NODE = 1,
	TEXT_NODE = 3
}

function toAS3XMLNode(as2Node: AVM1Object): XMLNode  {
	if (!(as2Node instanceof AVM1Object)) {
		return null;
	}
	const context = as2Node.context;
	if (!alInstanceOf(context, as2Node, context.globals.XMLNode)) {
		return null;
	}
	release || Debug.assert((<AVM1XMLNodePrototype>as2Node).as3XMLNode);
	return (<AVM1XMLNodePrototype>as2Node).as3XMLNode;
}

function fromAS3XMLNode(context: AVM1Context, as3Node: XMLNode): AVM1Object {
	if (isNullOrUndefined(as3Node)) {
		return undefined;
	}
	let as2Node: AVM1Object = (<any>as3Node)._as2Node;
	if (!as2Node) {
		as2Node = new AVM1Object(context);
		as2Node.alPrototype = context.globals.XMLNode.alGetPrototypeProperty();
		AVM1XMLNodePrototype.prototype.initializeFromAS3Node.call(as2Node, as3Node);
	} else {
		release || Debug.assert(as2Node.context === context);
	}
	return as2Node;
}

export class AVM1XMLNodeFunction extends AVM1Function {
	constructor(context: AVM1Context) {
		super(context);
		this.alSetOwnPrototypeProperty(new AVM1XMLNodePrototype(context, this));

	}

	alConstruct(args?: any[]): AVM1Object  {
		if (!args && args.length < 2) {
			Debug.notImplemented('Unsupported amount of parameters for AVM1XMLNode constructor');
			return undefined;
		}
		const type = alCoerceNumber(this.context, args[0]);
		const value = alCoerceString(this.context, args[1]);
		if (type !== AVM1XMLNodeType.ELEMENT_NODE && type !== AVM1XMLNodeType.TEXT_NODE) {
			Debug.notImplemented('Unsupported AVM1XMLNode type: ' + type);
			return undefined;
		}
		const obj = new AVM1Object(this.context);
		obj.alPrototype = this.alGetPrototypeProperty();
		AVM1XMLNodePrototype.prototype.initializeNode.call(obj, type, value);
		return obj;
	}

	alCall(thisArg: any, args?: any[]): any {
		return this.alConstruct(args);
	}
}

class AVM1XMLNodeChildNodes extends AVM1Object  {
	private _as3XMLNode: XMLNode;
	private _cachedNodePropertyDescriptor: AVM1PropertyDescriptor;

	constructor(context: AVM1Context, as3XMLNode: XMLNode) {
		super(context);
		this._as3XMLNode = as3XMLNode;
		this._cachedNodePropertyDescriptor = new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA |
			AVM1PropertyFlags.DONT_DELETE |
			AVM1PropertyFlags.READ_ONLY,
		undefined);
		alDefineObjectProperties(this, {
			length: {
				get: this.getLength
			}
		});
	}

	get as3ChildNodes(): any[] {
		return this._as3XMLNode.childNodes;//axGetPublicProperty('childNodes').value; // TODO .childNodes
	}

	getLength(): number {
		return this.as3ChildNodes.length;
	}

	alGetOwnProperty(p): AVM1PropertyDescriptor {
		if (alIsIndex(this.context, p)) {
			const index = alToInteger(this.context, p);
			if (index >= 0 && index < this.as3ChildNodes.length) {
				this._cachedNodePropertyDescriptor.value = fromAS3XMLNode(this.context, this.as3ChildNodes[index]);
				return this._cachedNodePropertyDescriptor;
			}
		}
		return super.alGetOwnProperty(p);
	}
}

class AVM1XMLNodeAttributes extends AVM1Object {
	private _as3Attributes: Object;
	private _cachedNodePropertyDescriptor: AVM1PropertyDescriptor;
	constructor(context: AVM1Context, as3Attributes: Object) {
		super(context);
		this.alPrototype = context.builtins.Object.alGetPrototypeProperty();
		this._as3Attributes = as3Attributes;
		this._cachedNodePropertyDescriptor = new AVM1PropertyDescriptor(AVM1PropertyFlags.DATA,
			undefined);
	}

	public alGetOwnProperty(p): AVM1PropertyDescriptor {
		const name = alCoerceString(this.context, p);
		if (this._as3Attributes.hasOwnProperty(name)) {
			this._cachedNodePropertyDescriptor.value =
				this._as3Attributes[name];
			return this._cachedNodePropertyDescriptor;
		}
		return undefined;
	}

	public alSetOwnProperty(p, desc: AVM1PropertyDescriptor): void {
		const name = alCoerceString(this.context, p);
		if ((desc.flags & AVM1PropertyFlags.DATA)) {
			const value = alCoerceString(this.context, desc.value);
			this._as3Attributes[name] = value;
		}
	}

	public alHasOwnProperty(p): boolean  {
		const name = alCoerceString(this.context, p);
		return this._as3Attributes.hasOwnProperty(name);
	}

	public alDeleteOwnProperty(p) {
		const name = alCoerceString(this.context, p);
		delete this._as3Attributes[name];
	}

	public alGetOwnPropertiesKeys(): string[] {
		const as3Keys = Object.keys(this._as3Attributes);

		return as3Keys.map((key) => alCoerceString(this.context, this._as3Attributes[key].name));
	}
}

class AVM1XMLNodePrototype extends AVM1Object {
	private _childNodes: AVM1XMLNodeChildNodes;
	private _attributes: AVM1Object;

	as3XMLNode: XMLNode;

	constructor(context: AVM1Context, fn: AVM1Function) {
		super(context);
		alDefineObjectProperties(this, {
			constructor: {
				value: fn,
				writable: true
			},
			attributes: {
				get: this.getAttributes,
				set: this.setAttributes
			},
			childNodes: {
				get: this.getChildNodes
			},
			firstChild: {
				get: this.getFirstChild
			},
			lastChild: {
				get: this.getLastChild
			},
			localName: {
				get: this.getLocalName
			},
			namespaceURI: {
				get: this.getNamespaceURI
			},
			nextSibling: {
				get: this.getNextSibling
			},
			nodeName: {
				get: this.getNodeName,
				set: this.setNodeName
			},
			nodeType: {
				get: this.getNodeType
			},
			nodeValue: {
				get: this.getNodeValue,
				set: this.setNodeValue
			},
			parentNode: {
				get: this.getParentNode
			},
			prefix: {
				get: this.getPrefix
			},
			previousSibling: {
				get: this.getPreviousSibling
			},

			appendChild: {
				value: this.appendChild
			},
			cloneNode: {
				value: this.cloneNode
			},
			getNamespaceForPrefix: {
				value: this.getNamespaceForPrefix
			},
			getPrefixForNamespace: {
				value: this.getPrefixForNamespace
			},
			hasChildNodes: {
				value: this.hasChildNodes
			},
			insertBefore: {
				value: this.insertBefore
			},
			removeNode: {
				value: this.removeNode
			},
			toString: {
				value: this._toString
			}
		});
	}

	initializeNode(type: number, value: string): void {
		this.as3XMLNode = new XMLNode(type, value);
		this._attributes = undefined;
		this._childNodes = undefined;
		AVM1XMLNodePrototype.addMap(this.as3XMLNode, this);
	}

	initializeFromAS3Node(as3XMLNode: XMLNode): void {
		this.as3XMLNode = as3XMLNode;
		this._attributes = undefined;
		this._childNodes = undefined;
		AVM1XMLNodePrototype.addMap(this.as3XMLNode, this);
	}

	_toString(): string {
		//	to match FP output we use replace
		//	to converting "/>" to " />"
		return new XMLSerializer().serializeToString(<any> this.as3XMLNode).replace(/\/>/g, ' />');
	}

	appendChild(newChild: AVM1Object): void {
		this.as3XMLNode.appendChild(toAS3XMLNode(newChild));
	}

	getAttributes(): AVM1Object {
		const as3Attributes = this.as3XMLNode.attributes;
		if (isNullOrUndefined(as3Attributes)) {
			return undefined;
		}
		// TODO create a proxy to map AVM2 object stuff to AVM1
		if (!this._attributes) {
			this._attributes = new AVM1XMLNodeAttributes(this.context, as3Attributes);
		}
		return this._attributes;
	}

	setAttributes(value: AVM1Object) {
		if (isNullOrUndefined(value)) {
			this._attributes = undefined;
			return;
		}
		if (value instanceof AVM1XMLNodeAttributes) {
			this._attributes = value;
			return;
		}
		const context = this.context;
		const as3Attributes = {};
		alForEachProperty(value, (prop) => {
			const name = alCoerceString(context, prop);
			const value = alCoerceString(context, this.alGet(prop));
			as3Attributes[name] = value;
		}, this);
		this._attributes = new AVM1XMLNodeAttributes(context, as3Attributes);
	}

	getChildNodes(): AVM1Object {
		if (!this._childNodes) {
			this._childNodes = new AVM1XMLNodeChildNodes(this.context, this.as3XMLNode);
		}
		return this._childNodes;
	}

	cloneNode(deepClone: boolean): AVM1Object {
		deepClone = alToBoolean(this.context, deepClone);
		const clone = this.as3XMLNode.axCallPublicProperty('cloneNode', [deepClone]);
		return fromAS3XMLNode(this.context, clone);
	}

	getFirstChild(): AVM1Object {
		return fromAS3XMLNode(this.context, this.as3XMLNode.firstChild);
	}

	getNamespaceForPrefix(prefix: string): string {
		return this.as3XMLNode.axCallPublicProperty('getNamespaceForPrefix', [prefix]);
	}

	getPrefixForNamespace(nsURI: string): string {
		return this.as3XMLNode.axCallPublicProperty('getNamespaceForPrefix', [nsURI]);
	}

	hasChildNodes(): boolean {
		return this.as3XMLNode.hasChildNodes();
	}

	insertBefore(newChild: AVM1Object, insertPoint: AVM1Object): void {
		this.as3XMLNode.axCallPublicProperty('insertBefore',
			[toAS3XMLNode(newChild), toAS3XMLNode(insertPoint)]);
	}

	getLastChild(): AVM1Object {
		return fromAS3XMLNode(this.context, this.as3XMLNode.lastChild);
	}

	getLocalName(): string {
		return this.as3XMLNode.localName;
	}

	getNamespaceURI(): string {
		return this.as3XMLNode.namespaceURI;
	}

	getNextSibling(): AVM1Object {
		return fromAS3XMLNode(this.context, this.as3XMLNode.nextSibling);
	}

	getNodeName(): string {
		return this.as3XMLNode.nodeName;
	}

	setNodeName(value: string) {
		value = alCoerceString(this.context, value);
		this.as3XMLNode.nodeName = value;
	}

	getNodeType(): number {
		return this.as3XMLNode.nodeType;
	}

	getNodeValue(): string {
		return this.as3XMLNode.nodeValue;
	}

	setNodeValue(value: string) {
		value = alCoerceString(this.context, value);
		this.as3XMLNode.nodeValue = value;
	}

	getParentNode(): AVM1Object {
		return fromAS3XMLNode(this.context, this.as3XMLNode.parentNode);
	}

	getPrefix(): string {
		return this.as3XMLNode.prefix;
	}

	getPreviousSibling(): AVM1Object {
		return fromAS3XMLNode(this.context, this.as3XMLNode.previousSibling);
	}

	removeNode(): void {
		this.as3XMLNode.removeNode();
	}

	static addMap(as3Node: XMLNode, as2Node: AVM1Object): void {
		release || Debug.assert(!(<any>as3Node)._as2Node);
		(<any>as3Node)._as2Node = as2Node;
	}
}

export class AVM1XMLFunction extends AVM1Function {
	constructor(context: AVM1Context, xmlNodeClass: AVM1XMLNodeFunction) {
		super(context);
		this.alSetOwnPrototypeProperty(new AVM1XMLPrototype(context, this, xmlNodeClass));
	}

	alConstruct(args?: any[]): AVM1Object  {
		let text = args && alCoerceString(this.context, args[0]);
		const obj = new AVM1Object(this.context);
		obj.alPrototype = this.alGetPrototypeProperty();
		(<IAVM1DataObject><any>obj).isAVM1DataObject = true;
		if (!text) text = '';
		AVM1XMLPrototype.prototype.initializeDocument.call(obj, text);

		return obj;
	}

	alCall(thisArg: any, args?: any[]): any {
		return this.alConstruct(args);
	}
}

class AVM1XMLPrototype extends AVM1Object implements IAVM1DataObject {
	constructor(context: AVM1Context, fn: AVM1Function, xmlNodeClass: AVM1XMLNodeFunction) {
		super(context);
		this.alPrototype = xmlNodeClass.alGetPrototypeProperty();
		alDefineObjectProperties(this, {
			constructor: {
				value: fn,
				writable: true
			},
			addRequestHeader: {
				value: this.addRequestHeader
			},
			createElement: {
				value: this.createElement
			},
			createTextNode: {
				value: this.createTextNode
			},
			getBytesLoaded: {
				value: this.getBytesLoaded
			},
			getBytesTotal: {
				value: this.getBytesTotal
			},
			ignoreWhite: {
				value: false,
				writable: true
			},
			load: {
				value: this.load
			},
			parseXML: {
				value: this.parseXML
			},
			send: {
				value: this.send
			},
			sendAndLoad: {
				value: this.sendAndLoad
			},
			onData: {
				value: this.defaultOnData,
				writable: true
			}
		});
	}

	as3XMLDocument: XMLDocumentAway;
	isAVM1DataObject: boolean;
	_as3Loader: URLLoader;

	initializeDocument(text: string) {
		text = alCoerceString(this.context, text) || null;

		// XMLDocument not callable, you must execute DOMParser for it

		const oParser = new DOMParser();
		const as3Doc = oParser.parseFromString(text, 'application/xml');

		AVM1XMLNodePrototype.prototype.initializeFromAS3Node.call(this, as3Doc);
		this.as3XMLDocument = <any>as3Doc;
	}

	addRequestHeader(headers: any, headerValue?: String): void {
		Debug.notImplemented('AVM1XMLPrototype.addRequestHeader');
	}

	createElement(name: string): AVM1Object {
		name = alCoerceString(this.context, name);
		const as3Node = this.as3XMLDocument.axCallPublicProperty('createElement', [name]);
		return fromAS3XMLNode(this.context, as3Node);
	}

	createTextNode(value: string): AVM1Object {
		value = alCoerceString(this.context, value);
		const as3Node = this.as3XMLDocument.axCallPublicProperty('createTextNode', [value]);
		return fromAS3XMLNode(this.context, as3Node);
	}

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
		loadAVM1DataObject(this.context, url, null, null, null, <IAVM1DataObject><any> this);
		return true;
	}

	defaultOnData(src: string) {
		if (isNullOrUndefined(src)) {
			avm1BroadcastEvent(this.context, this, 'onLoad', [false]);
			return;
		}
		AVM1XMLPrototype.prototype.parseXML.call(this, src);
		this.alPut('loaded', true);
		avm1BroadcastEvent(this.context, this, 'onLoad', [true]);
	}

	parseXML(value: string): void {
		value = alCoerceString(this.context, value);

		const oParser = new DOMParser();
		const as3Doc = <any>oParser.parseFromString(value, 'application/xml');
		const error = as3Doc.getElementsByTagName('parsererror');

		if (error.length > 0) {
			console.warn('[AVM1XML] Parsing error!');
			console.groupCollapsed(error[0].textContent);
			console.log(value);
			console.groupEnd();
		}
		this.as3XMLDocument = <any>as3Doc;
		/*this.as3XMLDocument.axSetPublicProperty('ignoreWhite',
			alToBoolean(this.context, this.alGet('ignoreWhite')));
		this.as3XMLDocument.axCallPublicProperty('parseXML', [value]);*/
	}

	send(url: string, target?: string, method?: string): boolean {
		url = alCoerceString(this.context, url);
		target = isNullOrUndefined(target) ? undefined : alCoerceString(this.context, target);
		method = isNullOrUndefined(method) ? undefined : alCoerceString(this.context, method);
		Debug.notImplemented('AVM1XMLPrototype.send');
		return false;
	}

	sendAndLoad(url: string, resultXML: AVM1Object): void {
		url = alCoerceString(this.context, url);
		if (!url) {
			return;
		}
		if (!(<IAVM1DataObject><any>resultXML).isAVM1DataObject) {
			return;
		}
		Debug.somewhatImplemented('AVM1XMLPrototype.send');
		// TODO check content types and test
		let contentType = this.alGet('contentType');
		contentType = isNullOrUndefined(contentType) ? undefined : alCoerceString(this.context, contentType);
		const data = alToString(this.context, this);
		loadAVM1DataObject(this.context, url, 'POST', contentType, data, <IAVM1DataObject><any>resultXML);
	}
}
