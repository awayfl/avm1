import { IAVMHandler, AVMStage, SWFParser, StageAlign, StageScaleMode } from '@awayfl/swf-loader';
import { SWFFile } from '@awayfl/swf-loader';
import { AVM1SceneGraphFactory } from './AVM1SceneGraphFactory';
import { ISceneGraphFactory, MouseEvent, KeyboardEvent, MovieClip,
	FrameScriptManager, DisplayObject } from '@awayjs/scene';
import { AssetLibrary, IAsset, EventBase } from '@awayjs/core';
import { AVMVERSION } from '@awayfl/swf-loader';
import { AVM1ContextImpl } from './interpreter';
import { SecurityDomain } from './SecurityDomain';
import { AVM1Globals, TraceLevel } from './lib/AVM1Globals';
import { AVM1MovieClip } from './lib/AVM1MovieClip';
import { AVM1EventProps } from './lib/AVM1EventHandler';
import { getAVM1Object } from './lib/AVM1Utils';
import { Stage } from '@awayjs/stage';

export class AVM1Handler implements IAVMHandler {
	public avmVersion: string = AVMVERSION.AVM1;
	private _avmStage: AVMStage;
	private _factory: AVM1SceneGraphFactory;

	private enterEvent: any = new EventBase('enterFrame');
	private exitEvent: any = new EventBase('exitFrame');

	private avm1Listener: any = {};

	public get factory(): ISceneGraphFactory {
		if (!this._factory)
			throw ('AVM1Handler - no factory set');
		return this._factory;
	}

	public init(avmStage: AVMStage, swfFile: SWFFile, callback: (hasInit: boolean) => void) {

		FrameScriptManager.useAVM1 = true;
		if (this._avmStage) {
			callback(false);
			return;
		}
		this._avmStage = avmStage;

		// 	we only do this in AVM1:
		//	stage is registered on MouseManager so we can dispatch events on it without event-bubbling
		//	AVM1 doesnt use veent bubbling, but has those onMouseDown / onMouseUp events that listen on stage,
		//	no matter what object they are assigned to.
		//	todo verify this is AVM1 only
		this._avmStage.mouseManager.eventBubbling = false;

		this._factory = new AVM1SceneGraphFactory(new AVM1ContextImpl(swfFile.swfVersion));
		this._factory.avm1Context.sec = new SecurityDomain();
		this._factory.avm1Context.setStage(this._avmStage, this, document);

		this._factory.avm1Context.swfVersion = swfFile.swfVersion;

		this._avmStage.scaleMode = StageScaleMode.SHOW_ALL;
		this._avmStage.align = StageAlign.TOP;

		AVM1Globals.tracelevel = TraceLevel.ALL;
		AVM1Globals._scenegraphFactory = this._factory;
		AssetLibrary.enableParser(SWFParser);

		// field is readonly, and assigned only in this place
		(<any> this._factory.avm1Context.globals.SWF_BASE_URL) =
			swfFile.url.substring(0, swfFile.url.lastIndexOf('/') + 1);

		this.clearAllAVM1Listener();

		const stage: Stage = this._avmStage.view.stage;
		stage.addEventListener(MouseEvent.MOUSE_DOWN, (evt)=>this.onMouseEvent(evt));
		stage.addEventListener(MouseEvent.MOUSE_UP, (evt)=>this.onMouseEvent(evt));
		stage.addEventListener(MouseEvent.MOUSE_MOVE, (evt)=>this.onMouseEvent(evt));
		stage.addEventListener(KeyboardEvent.KEYDOWN, (evt)=>this.onKeyEvent(evt));
		stage.addEventListener(KeyboardEvent.KEYUP, (evt)=>this.onKeyEvent(evt));

		if (this._avmStage.avmTestHandler) {
			(<any> this._factory.avm1Context).actions.originalTrace = (<any> this._factory.avm1Context).actions.trace;
			(<any> this._factory.avm1Context).actions.trace = (expression)=>{
				(<any> this._factory.avm1Context).actions.originalTrace(expression);
				this._avmStage.avmTestHandler.addMessage(expression);
			};
		}

		callback(true);
	}

	private executeEnterFrame(child: DisplayObject, enterFramesChilds) {
		let child2: DisplayObject;
		let c = (<any>child).numChildren;
		while (c > 0) {
			c--;
			child2 = (<any>child).getChildAt(c);
			this.executeEnterFrame(child2, enterFramesChilds);
		}
		if (child.isAsset(MovieClip)) {
			if (child.hasEventListener(this.enterEvent.type))
				enterFramesChilds.push(child);
		}
	}

	public enterFrame(dt: number) {
		// todo: do we need this ?
		this._avmStage.view.stage.clear();

		FrameScriptManager.execute_queue();

		this._avmStage.root.advanceFrame();

		FrameScriptManager.execute_queue();

		let i: number;
		let child: DisplayObject;

		const enterFramesChilds = [];

		// now dispatch the onEnterFrame
		for (i = 0; i < this._avmStage.root.numChildren; i++) {
			child = this._avmStage.root.getChildAt(i);
			this.executeEnterFrame(child, enterFramesChilds);
		}

		for (i = 0; i < enterFramesChilds.length; i++) {
			(<MovieClip>enterFramesChilds[i]).dispatchEvent(this.enterEvent);
		}
		FrameScriptManager.execute_queue();

		FrameScriptManager.execute_intervals(dt);
		FrameScriptManager.execute_queue();

		for (i = 0; i < this._avmStage.root.numChildren; i++) {
			child = this._avmStage.root.getChildAt(i);
			if (child.isAsset(MovieClip)) {
				(<MovieClip>child).dispatchExitFrame(this.exitEvent);
			}
		}

		FrameScriptManager.execute_queue();

	}

	private onKeyEvent(event): void {

		if (!this.avm1Listener[event.type])
			return;
		// the correct order for stage-event on childs is children first, highest depth first
		this._collectedDispatcher.length = 0;
		let i: number = 0;
		let child: DisplayObject;

		for (i = 0; i < this._avmStage.root.numChildren; i++) {
			child = this._avmStage.root.getChildAt(i);
			if (child.isAsset(MovieClip)) {
				this.collectMousEvents(child);
			}
		}

		for (i = 0; i < this._collectedDispatcher.length; i++) {
			if (this.avm1Listener[event.type] && this.avm1Listener[event.type][this._collectedDispatcher[i].id]) {
				const listeners = this.avm1Listener[event.type][this._collectedDispatcher[i].id];
				for (let e: number = 0; e < listeners.length; e++) {
					if (typeof listeners[e].keyCode !== 'number' || listeners[e].keyCode == event.keyCode)
						listeners[e].callback();
				}
			}
		}
		FrameScriptManager.execute_queue();
	}

	public addAVM1EventListener(asset: IAsset, type: string,
		callback: (event: EventBase) => void, eventProps: AVM1EventProps) {
		if (!this.avm1Listener[type])
			this.avm1Listener[type] = {};
		if (!this.avm1Listener[type][asset.id])
			this.avm1Listener[type][asset.id] = [];
		const listeners = this.avm1Listener[type][asset.id];
		listeners.push({ type: type, callback: callback });
		if (eventProps && typeof eventProps.keyCode === 'number') {
			listeners[listeners.length - 1].keyCode = eventProps.keyCode;

		}
	}

	public removeAVM1EventListener(asset: IAsset, type: string, callback: (event: EventBase) => void) {
		if (!this.avm1Listener[type])
			return;
		delete this.avm1Listener[type][asset.id];
	}

	public clearAllAVM1Listener() {
		this.avm1Listener = {};
	}

	private _collectedDispatcher: DisplayObject[] = [];
	public collectMousEvents(child: DisplayObject) {
		let child2: DisplayObject;
		let c = (<any>child).numChildren;
		while (c > 0) {
			c--;
			child2 = (<any>child).getChildAt(c);
			this.collectMousEvents(child2);
		}
		if (child.isAsset(MovieClip)) {
			this._collectedDispatcher[this._collectedDispatcher.length] = child;
		}

	}

	public onMouseEvent(mouseEvent: EventBase) {

		if (!this.avm1Listener[mouseEvent.type])
			return;
		// the correct order for stage-event on childs is children first, highest depth first
		this._collectedDispatcher.length = 0;
		let i: number = 0;
		let child: DisplayObject;
		let len: number = this._avmStage.root.numChildren;

		for (i = 0; i < len; i++) {
			child = this._avmStage.root.getChildAt(i);
			if (child.isAsset(MovieClip)) {
				this.collectMousEvents(child);
			}
		}

		len = this._collectedDispatcher.length;
		let dispatcherLen: number;
		for (i = 0; i < len; i++) {
			const listenersMouseType = this.avm1Listener[mouseEvent.type];
			if (listenersMouseType && listenersMouseType[this._collectedDispatcher[i].id]) {

				dispatcherLen = listenersMouseType[this._collectedDispatcher[i].id].length;
				for (let e: number = 0; e < dispatcherLen; e++) {
					const listeners = listenersMouseType[this._collectedDispatcher[i].id];
					if (listeners && listeners[e])
						listeners[e].callback();
				}
			}
		}
		FrameScriptManager.execute_queue();
	}

	public dispose() {
		// @todo
	}

	public resizeStage() {
		// @todo: is this available for AVM1 code
		// if so we must dispatch/broadcast a event here
	}

	public addAsset(asset: IAsset, addScene: boolean) {

		if (asset.isAsset(MovieClip)) {
			if (addScene && (<MovieClip>asset).isAVMScene) {
				const scene = <AVM1MovieClip>getAVM1Object(
					(<MovieClip>asset).clone(),
					<AVM1ContextImpl> this._factory.avm1Context
				);
				//scene.adaptee.reset();
				this._factory.avm1Context.globals._addRoot(0, <MovieClip>scene.adaptee);

				/*if(this._skipFrames>0){
					FrameScriptManager.execute_queue();
					if(this._skipFramesCallback){
						AudioManager.setVolume(0);
						this._skipFramesCallback(()=>{
							AudioManager.setVolume(1);
							(<MovieClip>asset).currentFrameIndex=this._skipFrames;
							(<MovieClip>asset).play();
						})
					}
					else{
						(<MovieClip>asset).currentFrameIndex=this._skipFrames;
						(<MovieClip>asset).play();
					}
				}*/
			}
		}
	}
}