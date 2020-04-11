import { IAVMHandler, AVMStage, PromiseWrapper, SWFParser, StageAlign, StageScaleMode } from "@awayfl/swf-loader"
import { SWFFile } from "@awayfl/swf-loader";
import { AVM1SceneGraphFactory } from "./AVM1SceneGraphFactory"
import { ISceneGraphFactory, MouseManager,MouseEvent, KeyboardEvent, MovieClip, FrameScriptManager, Sprite, DisplayObject } from "@awayjs/scene";
import { AssetLibrary, AssetEvent, IAsset, EventBase } from "@awayjs/core";
import { AVMVERSION } from "@awayfl/swf-loader";
import { PickGroup } from "@awayjs/view";
import { AVM1ContextImpl } from "./interpreter";
import { SecurityDomain } from "./SecurityDomain";
import { LoaderInfo } from "./customAway/LoaderInfo";
import { AVM1Globals, TraceLevel } from "./lib/AVM1Globals";
import { AVM1MovieClip } from './lib/AVM1MovieClip';
import { AVM1EventProps } from './lib/AVM1EventHandler';

export class AVM1Handler implements IAVMHandler {
	public avmVersion: string = AVMVERSION.AVM1;
	private _avmStage: AVMStage;
	private _factory: AVM1SceneGraphFactory;

	private enterEvent: any = new EventBase("enterFrame");
	private exitEvent: any = new EventBase("exitFrame");

	private avm1Listener: any = {};

	public get factory(): ISceneGraphFactory {
		if (!this._factory)
			throw ("AVM1Handler - no factory set");
		return this._factory;
	}
	public init(avmStage: AVMStage, swfFile: SWFFile, callback: (hasInit: boolean) => void) {

		if (this._avmStage) {
			callback(false);
			return;
		}
		this._avmStage = avmStage;

		this._avmStage.scene.mousePicker.shapeFlag = true;
		this._avmStage.scene.forceMouseMove = true;

		this._avmStage.scene.mouseManager._stage = this._avmStage;
		this._avmStage.scene.mouseManager.eventBubbling = false;

		var loaderInfo = new LoaderInfo();

		this._factory = new AVM1SceneGraphFactory(new AVM1ContextImpl(loaderInfo));
		this._factory.avm1Context.sec = new SecurityDomain();
		this._factory.avm1Context.setStage(this._avmStage, this, document);

		this._factory.avm1Context.swfVersion=swfFile.swfVersion;

		this._avmStage.scaleMode=StageScaleMode.SHOW_ALL;
		this._avmStage.align=StageAlign.TOP;
		
		AVM1Globals.tracelevel = TraceLevel.ALL;
		AVM1Globals._scenegraphFactory = this._factory;
		AssetLibrary.enableParser(SWFParser);

        this.clearAllAVM1Listener();
		this._avmStage.addEventListener(MouseEvent.MOUSE_DOWN, (evt)=>this.onMouseEvent(evt));
		this._avmStage.addEventListener(MouseEvent.MOUSE_UP, (evt)=>this.onMouseEvent(evt));
		this._avmStage.addEventListener(MouseEvent.MOUSE_MOVE, (evt)=>this.onMouseEvent(evt));
		this._avmStage.addEventListener(KeyboardEvent.KEYDOWN, (evt)=>this.onKeyEvent(evt));
		this._avmStage.addEventListener(KeyboardEvent.KEYUP, (evt)=>this.onKeyEvent(evt));
		

		callback(true);
	}
	private executeEnterFrame(child: DisplayObject, enterFramesChilds) {
		var child2: DisplayObject;
		var c = (<any>child).numChildren;
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
		this._avmStage.scene.renderer.stage.clear();

		FrameScriptManager.execute_queue();

		var i: number = 0;
		var c: number;
		var child: DisplayObject;
		var len: number = this._avmStage.numChildren;

		MovieClip._skipAdvance = true;
		for (i = 0; i < len; i++) {
			child = this._avmStage.getChildAt(i);
			// each child in here should be a swf-scene
			if (child.isAsset(MovieClip)) {
				(<MovieClip>child).advanceFrame();
			}

		}
		MovieClip._skipAdvance = false;
		FrameScriptManager.execute_queue();

		var enterFramesChilds = [];
		len = this._avmStage.numChildren;
		// now dispatch the onEnterFrame
		for (i = 0; i < len; i++) {
			child = this._avmStage.getChildAt(i);
			this.executeEnterFrame(child, enterFramesChilds);
		}

		len = enterFramesChilds.length;
		for (i = 0; i < len; i++) {
			(<MovieClip>enterFramesChilds[i]).dispatchEvent(this.enterEvent);
		}
		FrameScriptManager.execute_queue();

		FrameScriptManager.execute_intervals(dt);
		FrameScriptManager.execute_queue();

		len = this._avmStage.numChildren;
		for (i = 0; i < len; i++) {
			child = this._avmStage.getChildAt(i);
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
		var i: number = 0;
		var child: DisplayObject;
		var len: number = this._avmStage.numChildren;

		for (i = 0; i < len; i++) {
			child = this._avmStage.getChildAt(i);
			if (child.isAsset(MovieClip)) {
				this.collectMousEvents(child);
			}
		}

		len = this._collectedDispatcher.length;
		for (i = 0; i < len; i++) {
			if (this.avm1Listener[event.type] && this.avm1Listener[event.type][this._collectedDispatcher[i].id]) {
				for (var e: number = 0; e < this.avm1Listener[event.type][this._collectedDispatcher[i].id].length; e++) {
					if (typeof this.avm1Listener[event.type][this._collectedDispatcher[i].id][e].keyCode !== "number" ||
						this.avm1Listener[event.type][this._collectedDispatcher[i].id][e].keyCode == event.keyCode)
						this.avm1Listener[event.type][this._collectedDispatcher[i].id][e].callback();
				}
			}
		}
		FrameScriptManager.execute_queue();
	}
	public addAVM1EventListener(asset: IAsset, type: string, callback: (event: EventBase) => void, eventProps: AVM1EventProps) {
		if (!this.avm1Listener[type])
			this.avm1Listener[type] = {};
		if (!this.avm1Listener[type][asset.id])
			this.avm1Listener[type][asset.id] = [];
		this.avm1Listener[type][asset.id].push({ type: type, callback: callback });
		if (eventProps && typeof eventProps.keyCode === "number") {
			this.avm1Listener[type][asset.id][this.avm1Listener[type][asset.id].length - 1].keyCode = eventProps.keyCode;

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
		var child2: DisplayObject;
		var c = (<any>child).numChildren;
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
		var i: number = 0;
		var child: DisplayObject;
		var len: number = this._avmStage.numChildren;

		for (i = 0; i < len; i++) {
			child = this._avmStage.getChildAt(i);
			if (child.isAsset(MovieClip)) {
				this.collectMousEvents(child);
			}
		}

		len = this._collectedDispatcher.length;
		var dispatcherLen: number;
		for (i = 0; i < len; i++) {
			if (this.avm1Listener[mouseEvent.type] && this.avm1Listener[mouseEvent.type][this._collectedDispatcher[i].id]) {
				dispatcherLen = this.avm1Listener[mouseEvent.type][this._collectedDispatcher[i].id].length;
				for (var e: number = 0; e < dispatcherLen; e++) {
					if (this.avm1Listener[mouseEvent.type][this._collectedDispatcher[i].id] && this.avm1Listener[mouseEvent.type][this._collectedDispatcher[i].id][e])
						this.avm1Listener[mouseEvent.type][this._collectedDispatcher[i].id][e].callback();
				}
			}
		}
		FrameScriptManager.execute_queue();
	}
	public resizeStage() {
		// todo: is this available for AVM1 code
		// if so we must dispatch/broadcast a event here
	}
	public addAsset(asset: IAsset, addScene: boolean) {

		if (asset.isAsset(MovieClip)) {
			if (addScene && (<any>asset).isAVMScene) {
				this._avmStage.addChild(<MovieClip>asset);

				(<AVM1MovieClip>(<MovieClip>asset).adapter).initAdapter();
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