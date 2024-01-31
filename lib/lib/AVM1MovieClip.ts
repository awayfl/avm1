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

import {
	avm2AwayDepth,
	away2avmDepth,
	getAVM1Object,
	getAwayObjectOrTemplate,
	hasAwayJSAdaptee,
	initializeAVM1Object,
	toTwipFloor,
	wrapAVM1NativeClass,
} from './AVM1Utils';
import {
	alCoerceString,
	alForEachProperty,
	alIsArray,
	alIsName,
	alNewObject,
	alToBoolean,
	alToInt32,
	alToNumber,
	alToString,
	AVM1PropertyFlags,
	IAVM1Context,
} from '../runtime';
import { AVM1Context } from '../context';
import { assert, AVMStage, Debug, isNullOrUndefined, release, somewhatImplemented, warning, } from '@awayfl/swf-loader';
import { AVM1BitmapData, toAS3BitmapData } from './AVM1BitmapData';
import { toAS3Matrix } from './AVM1Matrix';
import { AVM1ArrayNative } from '../natives';
import { copyAS3PointTo, toAS3Point } from './AVM1Point';
import { MovieClipProperties } from '../interpreter/MovieClipProperties';
import {
	DisplayObject,
	DisplayObjectContainer,
	FrameScriptManager,
	IDisplayObjectAdapter,
	IFrameScript,
	IMovieClipAdapter,
	MouseEvent as AwayMouseEvent,
	MovieClip,
	TextField,
	TextFormat,
	Timeline,
} from '@awayjs/scene';
import { AssetLibrary, Matrix3D, Point, Rectangle, WaveAudio, } from '@awayjs/core';
import { AVM1TextField } from './AVM1TextField';
import { GradientType, Graphics } from '@awayjs/graphics';
import { LineScaleMode } from '@awayjs/renderer';
import { AVM1SymbolBase } from './AVM1SymbolBase';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Stage } from './AVM1Stage';

import { AVM1PropertyDescriptor } from '../runtime/AVM1PropertyDescriptor';
import { AVM1EventHandler, EventsListForMC } from './AVM1EventHandler';
import { AVM1LoaderHelper } from './AVM1LoaderHelper';
import { AVM1InterpretedFunction } from '../interpreter';
import { EntityNode, PickEntity } from '@awayjs/view';
import { AVM1Function } from '../runtime/AVM1Function';
import { AVM1Globals } from './AVM1Globals';

interface IVirtualSceneGraphItem {
	sessionID: number,
	depth: number,
	addedOnTargetFrame: boolean,
	symbolID?: number,
	child?: any
}

export const enum LookupChildOptions {
	DEFAULT = 0,
	IGNORE_CASE = 1,
	INCLUDE_NON_INITIALIZED = 2
}

function convertAS3RectangeToBounds(as3Rectange: any, context: IAVM1Context): AVM1Object {
	const result = alNewObject(context);
	result.alPut('xMin', as3Rectange.left);
	result.alPut('yMin', as3Rectange.top);
	result.alPut('xMax', as3Rectange.right);
	result.alPut('yMax', as3Rectange.bottom);
	return result;
}

export class AVM1MovieClip extends AVM1SymbolBase<MovieClip> implements IMovieClipAdapter {
	private _hitReportCount: number = 0;
	private _depthToChilds: NumberMap<DisplayObject> = {};
	// should be a 0, but it return a -1 when there are not childrens
	private _nextHighestDepth: number = 1;

	public static currentMCAssetNameSpace: string = '';
	public static currentDraggedMC: AVM1MovieClip = null;

	// if a stop-action occurs, we check if a child with this name is present,
	// and if so, we execute the function provided
	public static pokiSDKonStopActionChildName: string = null;
	public static pokiSDKonStopAction: any = null;
	public static createAVM1Class(context: AVM1Context): AVM1Object {
		return wrapAVM1NativeClass(context, true, AVM1MovieClip,
			[],
			['$version#', '_alpha#', 'getAwayJSID', 'attachAudio', 'attachBitmap', 'attachMovie',
				'attachVideo',
				'beginFill', 'beginBitmapFill', 'beginGradientFill', 'blendMode#',
				'cacheAsBitmap#', '_callFrame', 'clear', 'createEmptyMovieClip',
				'createTextField', '_currentframe#', 'curveTo', '_droptarget#',
				'duplicateMovieClip', 'enabled#', 'endFill', 'filters#', '_framesloaded#',
				'_focusrect#', 'forceSmoothing#', 'getBounds',
				'getBytesLoaded', 'getBytesTotal', 'getDepth', 'getInstanceAtDepth',
				'getNextHighestDepth', 'getRect', 'getSWFVersion', 'getTextSnapshot',
				'getURL', 'globalToLocal', 'gotoAndPlay', 'gotoAndStop', '_height#',
				'_highquality#', 'hitArea#', 'hitTest', 'lineGradientStyle', 'lineStyle',
				'lineTo', 'loadMovie', 'loadVariables', 'localToGlobal', '_lockroot#',
				'menu#', 'moveTo', '_name#', 'nextFrame', 'opaqueBackground#', '_parent#',
				'play', 'prevFrame', '_quality#', 'removeMovieClip', '_root#', '_rotation#',
				'scale9Grid#', 'scrollRect#', 'setMask', '_soundbuftime#', 'startDrag',
				'stop', 'stopDrag', 'swapDepths', 'tabChildren#', 'tabEnabled#', 'tabIndex#',
				'_target#', '_totalframes#', 'trackAsMenu#', 'transform#', 'toString',
				'unloadMovie', '_url#', 'useHandCursor#', '_visible#', '_width#',
				'_x#', '_xmouse#', '_xscale#', '_y#', '_ymouse#', '_yscale#']);
	}

	public static capStyleMapStringToInt: any = { 'none': 0, 'round': 1, 'square': 2 };
	public static jointStyleMapStringToInt: any = { 'round': 0, 'bevel': 1, 'miter': 2 };

	private static noScaleDictionary: Object = {
		'normal': LineScaleMode.NORMAL,
		'none': LineScaleMode.NONE,
		'vertical': LineScaleMode.VERTICAL,
		'horizontal': LineScaleMode.HORIZONTAL
	}

	public onLoaded: Function;
	public onConstruct: AVM1Function;
	public onInitialize: AVM1Function;

	private get _stage(): AVMStage {
		return AVM1Stage.avmStage;
	}

	/*internal*/ setDepthToChild(depth: number, child?: DisplayObject) {
		if (!child) {
			delete this._depthToChilds[depth];
			//console.debug('[AVM1 MC]', this.adaptee.id, ' remove child at depth:', depth);
			return;
		}

		this._depthToChilds[depth] = child;
		//console.debug('[AVM1 MC]', this.adaptee.id, ' add child at depth:', depth);
	}

	/*internal*/ getDepthToChild(depth: number) {
		const child = this._depthToChilds[depth];
		//console.debug('[AVM1 MC]', this.adaptee.id, ' get child at depth:', depth, !!child);
		return child;
	}

	public addTimelineChildAtDepth(child: DisplayObject, depth: number) {
		depth -= 16383;
		if (child.adapter != child && (<any>child.adapter).deleteOwnProperties) {
			(<any>child.adapter).deleteOwnProperties();
		}

		child.reset();
		this.addChildAtDepth(child, depth, true);
	}

	public removeTimelineChildAt(value: number): void {
		// avm1 supplied value is depth
		value -= 16383;
		this.removeChildAtDepth(value);
	}

	public removeAllTimelineChilds(): void {
		for (let i = this.adaptee.numChildren - 1; i >= 0; i--) {
			const child = this.adaptee.getChildAt(i);

			if (child._avmDepthID < 0)
				this.adaptee.removeChildAt(i);
		}
	}

	public getTimelineChildAtSessionID(sessionID: number): DisplayObject {
		return (<MovieClip> this.adaptee).getTimelineChildAtSessionID(sessionID);
	}

	public getDepthIndexInternal(depth: number): number {
		const child = this.getDepthToChild(depth);

		if (!child) {
			return -1;
		}

		// getChildIndex us throwable when parnet is not valid
		if (child.parent !== this.adaptee) {
			return -1;
		}

		return this.adaptee.getChildIndex(child);
	}

	public getIndexFromDepthOrTop(depth: number): number {
		for (let i = 0; i < this.adaptee.numChildren; i++) {
			if (this.adaptee.getChildAt(i)._avmDepthID > depth)
				return i;
		}

		// return top index when a depth not exist ellement with depth greater a requested
		return this.adaptee.numChildren;
	}

	public removeChildAtDepth(depth: number) {
		const idx: number = this.getDepthIndexInternal(depth);

		if (idx !== -1) {
			this.removeChildAt(idx);
		}
	}

	public removeChildAt(index: number) {

		const child: DisplayObject = this.adaptee.removeChildAt(index);

		if (child._adapter)
			(<IMovieClipAdapter>child.adapter).freeFromScript();

		this.unregisterScriptObject(child);

		delete this.adaptee._sessionID_childs[child._sessionID];
		//delete this._depthToChilds[child._avmDepthID];
		this.setDepthToChild(child._avmDepthID);

		child._sessionID = -1;
		child._avmDepthID = -16384;

	}

	private addChildAtDepth<T extends DisplayObject>(child: T,
		depth: number,
		fromTimeline: boolean = false
	): AVM1Object {

		//console.log("[AVM1MovieClip]", this.adaptee.name, "addChildAtDepth", child, depth, fromTimeline);

		// if depth is already occupied:
		//		- when addChild is invoke from script: replace existing object
		//		- when addChild is invoked from timeline: return and do nothing
		if (child == null)
			throw ('Parameter child cannot be null.');

		const index = this.getDepthIndexInternal(depth);

		if (index != -1) {
			if (fromTimeline) {
				console.log('depth is occupied');
				return null;
			}
			this.removeChildAt(index);
			this.adaptee.addChildAt(child, index);
		} else {
			this.adaptee.addChildAt(child, this.getIndexFromDepthOrTop(depth));
		}

		if (this.adaptee.isSlice9ScaledMC && child.assetType == '[asset Sprite]') {
			child.isSlice9ScaledSprite = true;
		}

		if (this._nextHighestDepth < depth + 1)
			this._nextHighestDepth = depth + 1;

		child._avmDepthID = depth;

		if (child.adapter != child) {
			(<IDisplayObjectAdapter>child.adapter).initAdapter();
		}

		this.setDepthToChild(depth, child);
		//this._depthToChilds[depth] = child;

		if (fromTimeline) {
			this.adaptee._sessionID_childs[child._sessionID] = child;
		}

		const avmChild = getAVM1Object(child, <AVM1Context> this._avm1Context);

		// so, we should register node at this place too
		// because timeline not register child before update_child,
		// but it not always can be called.

		this.registerScriptObject(child, fromTimeline);

		return avmChild;
	}

	public sortVirtualSceneGraph(a: IVirtualSceneGraphItem, b: IVirtualSceneGraphItem): number {
		return a.depth - b.depth;
	}

	/**
	 * queue the framescripts for a specific frame
	 * @param timeline
	 * @param frame_idx
	 * @param scriptPass1
	 */
	public queueFrameScripts(timeline: Timeline, frame_idx: number, scriptPass1: boolean) {
		const frameScripts = timeline.get_script_for_frame(this.adaptee, frame_idx, true);
		if (frameScripts) {
			//console.log("add framescript", target_mc, target_mc.name, keyframe_idx, scriptPass1 );
			if (scriptPass1)
				FrameScriptManager.add_script_to_queue(this.adaptee, frameScripts);
			else
				FrameScriptManager.add_script_to_queue_pass2(this.adaptee, frameScripts);
		}
	}

	// should only be called from timeline when navigating frames
	public constructFrame(timeline: Timeline, start_construct_idx: number,
		target_keyframe_idx: number, jump_forward: boolean,
		frame_idx: number, queue_pass2: boolean, queue_script: boolean) {

		const virtualSceneGraphMap: NumberMap<IVirtualSceneGraphItem> = {};
		const existingSessionIDs: NumberMap<DisplayObject> = {};

		// step1: prepare virtual-scenegraph:

		// collect existing children into a virtual-scenegraph
		// if we jump forward, we collect all children
		// if we jump back, we only collect children with depth > 0 (usually added via script)
		let len = this.adaptee.numChildren;
		for (let i = 0; i < len; i++) {
			const child = this.adaptee.getChildAt(i);
			if (jump_forward || child._sessionID == -1) {
				virtualSceneGraphMap[child._avmDepthID] = {
					sessionID:child._sessionID,
					addedOnTargetFrame:false,
					depth:child._avmDepthID,
					child: child
				};
			}
			if (child._sessionID >= 0)
				existingSessionIDs[child._sessionID] = child;
		}

		// step2: apply add/remove commands into virtual-scenegraph

		let i: number;
		let k: number;

		timeline._update_indices.length = 0;
		timeline._update_frames.length = 0;
		let update_cnt = 0;
		let start_index: number;
		let end_index: number;
		for (k = start_construct_idx; k <= target_keyframe_idx; k++) {
			let frame_command_idx: number = timeline.frame_command_indices[k];
			const frame_recipe: number = timeline.frame_recipe[k];
			if (frame_recipe & 2) {
				// remove childs by depth. no matter what object is at the depth, it gets removed
				start_index = timeline.command_index_stream[frame_command_idx];
				end_index = start_index + timeline.command_length_stream[frame_command_idx++];
				for (i = start_index; i < end_index; i++) {
					delete virtualSceneGraphMap[timeline.remove_child_stream[i] - 16383];
				}
			}
			if (frame_recipe & 4) {
				start_index = timeline.command_index_stream[frame_command_idx];
				end_index = start_index + timeline.command_length_stream[frame_command_idx++];
				if (queue_pass2) {
					for (i = end_index - 1; i >= start_index; i--) {
						// in as2 only want to add childs if the depth is free
						if (!virtualSceneGraphMap[timeline.add_child_stream[i * 3 + 1] - 16383]) {
							virtualSceneGraphMap[timeline.add_child_stream[i * 3 + 1] - 16383] = {
								sessionID:timeline.add_child_stream[i * 3],
								symbolID:timeline.add_child_stream[i * 3 + 2],
								addedOnTargetFrame:k == target_keyframe_idx,
								depth:timeline.add_child_stream[i * 3 + 1] - 16383
							};
						}
					}
				} else {
					for (i = start_index; i < end_index; i++) {
						if (!virtualSceneGraphMap[timeline.add_child_stream[i * 3 + 1] - 16383]) {
							virtualSceneGraphMap[timeline.add_child_stream[i * 3 + 1] - 16383] = {
								sessionID:timeline.add_child_stream[i * 3],
								symbolID:timeline.add_child_stream[i * 3 + 2],
								addedOnTargetFrame:k == target_keyframe_idx,
								depth:timeline.add_child_stream[i * 3 + 1] - 16383
							};
						}
					}
				}
			}
			if (frame_recipe & 8) {
				timeline._update_frames[update_cnt] = timeline.keyframe_firstframes[k];
				timeline._update_indices[update_cnt++] = frame_command_idx++;
			}

			if (frame_recipe & 16 && k == target_keyframe_idx) {
				timeline.start_sounds(this.adaptee, frame_command_idx);
			}
		}

		// step3: sort virtual scenegraph by depth

		const virtualSceneGraph: IVirtualSceneGraphItem[] = [];
		for (const key in virtualSceneGraphMap) {
			virtualSceneGraph[virtualSceneGraph.length] = virtualSceneGraphMap[key];
		}
		virtualSceneGraph.sort(this.sortVirtualSceneGraph);

		const newChildren: DisplayObject[] = [];
		let vsItem: IVirtualSceneGraphItem;
		const newChilds: DisplayObject[] = [];
		const newChildsOnTargetFrame: DisplayObject[] = [];

		this._depthToChilds = {};
		this.adaptee._sessionID_childs = {};

		// step4: compare virtual scenegraph against current children
		// - if child exists in both, and has same session id, we keep it alive
		// - if it is a new child, we create new instance

		// for new children that was not added on target-frame, we prevent framescripts
		this.adaptee.preventScript = true;
		len = newChildren.length = virtualSceneGraph.length;
		for (let i = 0; i < len; i++) {
			vsItem = virtualSceneGraph[i];
			if (vsItem.sessionID == -1 && vsItem.child) {
				newChildren[i] = vsItem.child;
				this.setDepthToChild(vsItem.depth, vsItem.child);
			} else if (existingSessionIDs[vsItem.sessionID]) {
				//	the same sessionID already is child of the mc
				const existingChild = existingSessionIDs[vsItem.sessionID];
				const depth = vsItem.depth;

				//	set existing child to correct depth:
				existingChild._avmDepthID = depth;
				existingChild._sessionID = vsItem.sessionID;

				this.setDepthToChild(depth, existingChild);
				this.adaptee._sessionID_childs[vsItem.sessionID] = existingChild;

				newChildren[i] = existingChild;
				//console.log("vsItem.exists", vsItem);
				if (!jump_forward) {
					if (newChildren[i]._adapter) {
						if (!(<IDisplayObjectAdapter> newChildren[i].adapter).isColorTransformByScript()) {
							newChildren[i].transform.clearColorTransform();
						}
						if (!(<IDisplayObjectAdapter> newChildren[i].adapter).isBlockedByScript()
							&& !(<any>newChildren[i]).noTimelineUpdate) {
							newChildren[i].transform.clearMatrix3D();
							newChildren[i].updateTimelineMask(null);
						}
						if (!(<IDisplayObjectAdapter> newChildren[i].adapter).isVisibilityByScript()) {
							newChildren[i].visible = true;
						}
					} else {
						newChildren[i].transform.clearColorTransform();
						newChildren[i].transform.clearMatrix3D();
						newChildren[i].visible = true;
						newChildren[i].updateTimelineMask(null);
					}
				}
			} else {
				const newChild = <DisplayObject>timeline.getChildInstance(vsItem.symbolID, vsItem.sessionID);

				if (this.adaptee.isSlice9ScaledMC && newChild.assetType == '[asset Sprite]') {
					newChild.isSlice9ScaledSprite = true;
				}

				const depth = newChild._avmDepthID = vsItem.depth;

				newChild._sessionID = vsItem.sessionID;

				//this._depthToChilds[depth] = newChild;
				this.setDepthToChild(depth, newChild);
				this.adaptee._sessionID_childs[vsItem.sessionID] = newChild;

				newChildren[i] = newChild;
				if (vsItem.addedOnTargetFrame) {
					newChildsOnTargetFrame[newChildsOnTargetFrame.length] = newChild;
				} else {
					newChilds[newChilds.length] = newChild;
				}
			}
		}

		for (let i = this.adaptee.numChildren - 1; i >= 0; i--)
			if (newChildren.indexOf(this.adaptee.getChildAt(i)) < 0)
				this.adaptee.removeChildAt(i);

		for (let i = 0; i < newChildren.length; i++)
			if (!this.adaptee.contains(newChildren[i]))
				this.adaptee.addChildAt(newChildren[i], i);

		this.adaptee.preventScript = true;
		this.finalizeChildren(newChilds);
		this.adaptee.preventScript = false;

		// if there is a framescript on this frame, we queue it now, so it sits after the initAdapter of the children
		if (queue_script)
			this.queueFrameScripts(timeline, frame_idx, !queue_pass2);

		this.finalizeChildren(newChildsOnTargetFrame);

	}

	public finalizeChildren(children: DisplayObject[]) {
		const len = children.length;
		for (let i = 0; i < len; i++) {
			const newChild = children[i];
			if (newChild.adapter != newChild && (<any>newChild.adapter).deleteOwnProperties) {
				(<any>newChild.adapter).deleteOwnProperties();
			}
			newChild.reset();
			if (newChild.adapter != newChild) {
				// initAdapter is only used for avm1 to queue constructors / init-actions
				// for avm2 this is handled via FrameScriptManager.execute_as3_constructors_recursiv
				(<IDisplayObjectAdapter>newChild.adapter).initAdapter();
			}
		}
	}

	public removeMovieClip() {
		if (this.adaptee.isAVMScene) {
			return; // let's not remove root symbol
		}

		if (!this.adaptee.parent || away2avmDepth(this.adaptee._avmDepthID)  < 0) {
			return;
		}

		const avm1parent: AVM1MovieClip = <AVM1MovieClip> this.adaptee.parent.adapter;
		avm1parent.removeChildAtDepth(this.adaptee._avmDepthID);

		if (this.scriptMaskee) {
			(<AVM1MovieClip> this.scriptMaskee).setMask(null);
		}

		// to be sure
		this.freeFromScript();

		// todo should we unlink all child and call removeMovieClip recursive  or not?
		// workground for https://github.com/awaystudios/nitrome-conversions-batch7/issues/9
		this._childrenByName = {};
		this._depthToChilds = {};

		// going to ghost mode
		this.makeGhost();

		// todo why whe should keep adaptee?
		// this.adaptee?.dispose();
	}

	protected _mouseButtonListenerCount: number;
	public _updateMouseEnabled(event: AVM1EventHandler, enabled: boolean): void {
		if (!this.adaptee.isAVMScene) {
			if (event.isMouse) {
				if (enabled) {
					this._mouseListenerCount++;
					this.adaptee.mouseEnabled = true;
					this.adaptee.mouseChildren = false;
					if (event.isButton) {
						this._mouseButtonListenerCount++;
						(<any> this.adaptee).buttonMode = true;
					}
				} else {
					this._mouseListenerCount--;
					if (this._mouseListenerCount <= 0) {
						this._mouseListenerCount = 0;
						this.adaptee.mouseEnabled = false;
						this.adaptee.mouseChildren = true;
					}
					if (event.isButton) {
						this._mouseButtonListenerCount--;
						if (this._mouseButtonListenerCount <= 0) {
							this._mouseButtonListenerCount = 0;
							(<any> this.adaptee).buttonMode = false;
						}
					}
				}
			}
		}
		if (!this.enabled) {
			this.adaptee.mouseChildren = false;
		}
	}

	public executeConstructor: Function = null;
	/**
	 * Lock object of `unregister` method. Required for AVM1BtimapData.draw
	 */
	/*internal*/ _locked: boolean = false;

	public clone() {
		const clone = <AVM1MovieClip>getAVM1Object(this.adaptee.clone(), <AVM1Context> this._avm1Context);
		//console.log("this.adaptee._symbol", this.adaptee.name)
		if (this.adaptee.name == 'piratefont') {

			const timeline = (<any>clone.adaptee).timeline;
			const targetTimeline = timeline;

			targetTimeline.frame_command_indices = <any>[timeline.frame_command_indices[0]];
			targetTimeline.frame_recipe = <any>[timeline.frame_recipe[0]];
			targetTimeline.keyframe_constructframes = [timeline.keyframe_constructframes[0]];
			targetTimeline.keyframe_durations = <any>[timeline.keyframe_durations[0]];
			targetTimeline.keyframe_firstframes = [timeline.keyframe_firstframes[0]];
			targetTimeline.keyframe_indices = [timeline.keyframe_indices[0]];
		}
		return clone;
	}

	private attachCustomConstructor() {
		if (this.adaptee) {
			const symbolClass: AVM1InterpretedFunction = <AVM1InterpretedFunction> this.adaptee.avm1Symbol;
			if (symbolClass) {
				this.alPut('__proto__', symbolClass._ownProperties.prototype.value);
				const myThis = this;
				this.executeConstructor = function () {
					symbolClass.alCall(myThis);
					myThis.updateAllEvents();
				};
			}
		}
	}

	public executeScript(actionsBlocks: IFrameScript[]) {
		AVM1MovieClip.currentMCAssetNameSpace = this.adaptee.assetNamespace;
		AVM1TextField.syncQueedTextfields();
		if (!actionsBlocks) {
			const name: string = this.adaptee.name.replace(/[^\w]/g, '');
			window.alert('actionsBlocks is empty, can not execute framescript' + name + this.adaptee.currentFrameIndex);
			return;
		}
		if (!this.adaptee.parent)
			return;

		for (let k = 0; k < actionsBlocks.length; k++) {
			const actionsBlock: any = actionsBlocks[k];
			const script = function (actionsData: any) {
				this._avm1Context.executeActions(actionsData, this);
			}.bind(this, actionsBlock.data);

			script.precedence = actionsBlock.precedence;
			script.context = this.adaptee;
			script.call(this.adaptee);
		}
	}

	public stopAllSounds() {
		const allProps = this.alGetKeys();

		for (let i = 0; i < allProps.length; i++) {
			const desc = this.alGetProperty(allProps[i]);
			const val = desc ? desc.value : null;

			if (
				val &&
				val._sound &&
				val._sound.isAsset &&
				val._sound.isAsset(WaveAudio)
			) {
				val.stop();
			}
		}

		let child: DisplayObject;
		for (let i = this.adaptee.numChildren - 1; i >= 0; i--) {
			child = this.adaptee.getChildAt(i);
			if (child.isAsset(MovieClip) && child.adapter !== child) {
				(<IMovieClipAdapter>child.adapter).freeFromScript();
			}
		}
	}

	// called from adaptee whenever the mc gets reset
	public freeFromScript(): void {
		if (this._locked) {
			return;
		}

		//this.stopAllSounds();
		this.hasSwappedDepth = false;
		super.freeFromScript();
		this._mouseButtonListenerCount = 0;

	}

	// called from adaptee whenever the mc gets added to a parent
	public initAdapter(): void {
		this._dropTarget = '';
		this._mouseButtonListenerCount = 0;
		AVM1MovieClip.currentMCAssetNameSpace = this.adaptee.assetNamespace;

		// execute the init-actionscript that is stored on timeline
		for (const key in this.adaptee.timeline.avm1InitActions)
			this.executeScript(AVM1Globals._scenegraphFactory.createFrameScripts(
				this.adaptee.timeline.avm1InitActions[key], 0, 'initActionsData' + key, this.adaptee.id));

		if ((<any> this).initEvents) {
			initializeAVM1Object(this.adaptee, <AVM1Context> this._avm1Context, (<any> this).initEvents);
		}
		this.attachCustomConstructor();
		this.initialDepth = this.adaptee._avmDepthID;

		if ((<any> this.adaptee).onLoaded
			|| (<any> this.adaptee).onConstruct
			|| (<any> this.adaptee).onInitialize
			|| this.executeConstructor) {
			FrameScriptManager.add_loaded_action_to_queue(this.adaptee);
		}

	}

	public registerScriptObject(child: DisplayObject, fromTimeline: boolean = true): void {

		//	whenever multiple childs get registered for the same name, the child with the lowest depth wins
		//	this is true for objects added via
		//	timeline, attachMovie, duplicateMovieClip and CreateEmptyMovieClip and also when renaming objects

		//	if a avm1 variable for a registered child-name was defined via script,
		//	it always wins over the child registration.
		//	for example, after setting "testMC='something'" in script, trying to get "testMC" will return "something",
		//	and childs with the name "testMC" will no longer be accessible.
		//	this is true for all datatypes. once a variable is set by script, the value set by script will be returned.
		//	also true if the we do something like "testMC=null"

		//	if a avm1 script creates a variable as reference to a registered child, it behaves like this:
		//	the var is not updated if the child registered for the name changes
		//	if we do something like this:
		//			indirectRef = testMC;
		//			this.attachMovie("somethingFromLib", "testMC", -16380)
		//			testMC._x=100;
		//			testMC._y=100;
		//			indirectRef._x=100;
		//			indirectRef._y=100;
		//	this code will move both objects,
		//	because the attachMovie changes the object that is available under the name "testMC",
		//	but the indirectRef still holds the reference to the original object.
		//	however, if we remove the original child via removeMovieCLip or if it is removed via timeline,
		//	the variable will return a reference to the current object that might now be registered
		//	under the same name as the object that the variable was created for.

		// 	if a movieclip was tinted by a color object,
		//	and than another mc gets registered for the name, the tinting is applied to the new mc

		if (child.adapter != child)
			(<any>child.adapter).setEnabled(true);

		let name = child.name;
		if (name) {
			// 	in AVM1 FP<8, all names ignore case, so we can just convert everything to lower case
			//	for FP>=8, only method names can be handled this way, object names need to keep their case

			if (this.context.swfVersion < 8)
				name = name.toLowerCase();

			const hasVar = this.alHasOwnProperty(name);
			if (fromTimeline && hasVar) {

				// there exists a avm1 var for this name. Object registration should fail
				const ownDesc = this.alGetOwnProperty(name);
				if ((<any>ownDesc).isTextVar) {
					//var registered for textfields-variables are a special case. they do not block registration
					// instead we update the var to the new object
					this.alPut(name, getAVM1Object(child, this.context));
				} else {
					return;
				}
			}

			//	only register object if:
			//			- no object is registered for this name,
			//			- a already registered object has no valid parent
			//			- the already registered object has a higher depthID than the new object
			if (!this._childrenByName[name]
				|| (this._childrenByName[name].adaptee && this._childrenByName[name].adaptee.parent == null)
				|| (this._childrenByName[name].adaptee
				&& this._childrenByName[name].adaptee._avmDepthID > child._avmDepthID)) {

				//register new object
				this._childrenByName[name] = getAVM1Object(child, this.context);

				// timeline nodes should presented as vars too
				// but in readonly mode
				// you can't delete it by `delete` operation
				// and rewrite

				if (!fromTimeline) {
					this.alPut(name, this._childrenByName[name]);
				}
			}
		}
	}

	private unregisteredColors: any = {};
	public unregisterScriptObject(child: DisplayObject): void {
		if ((child.adapter as AVM1MovieClip)._locked) {
			return;
		}

		//if (child && child.adapter != child)
		//	(<any>child.adapter).alPut("onEnterFrame", null);
		let name = child.name;
		if (name) {
			// 	in AVM1 FP<8, all names ignore case, so we can just convert everything to lower case
			//	for FP>=8, only method names can be handled this way, object names need to keep their case
			if (this.context.swfVersion < 8)
				name = name.toLowerCase();

			// unregister al-property, only if it is of type AVM1Symbolbase
			// this makes sure that objects from timeline unregister,
			// but other property-types are left alone
			const ownDesc = this.alGetOwnProperty(name);
			if (ownDesc && ((<any>ownDesc).value instanceof AVM1SymbolBase)) {
				this.alDeleteOwnProperty(name);
			}

			if (this._childrenByName[name] && this._childrenByName[name].adaptee.id == child.id) {

				/*if (this._childrenByName[name] && this._childrenByName[name].avmColor) {
					this.unregisteredColors[name] = this._childrenByName[name].avmColor;
				}*/

				// 	check if there is another child with the same name on the movieclip
				//	and if so, register it instead
				//	if multiple childs match the name, get the one with highest depth
				//	attention: at this point the child that we unregister right now is still child of the mc
				let tmpChild = null;
				let newChild = null;
				for (let i = 0; i < this.adaptee.numChildren; i++) {
					tmpChild = this.adaptee.getChildAt(i);
					if (tmpChild != child && tmpChild.name && tmpChild.name.toLowerCase() == name) {

						if (!newChild || newChild._avmDepthID > tmpChild._avmDepthID) {
							newChild = tmpChild;
						}
					}
				}

				//	if we have a new child to register, we register it
				//	if not, we delete the registration for this name
				if (newChild) {
					this._childrenByName[name] = getAVM1Object(newChild, this.context);

					//if (this.unregisteredColors[name]) {
					//	this.unregisteredColors[name].changeTarget(newChild.adapter);
					//	this.unregisteredColors[name] = null;
					//}
				} else {
					delete this._childrenByName[name];
				}
			}
		}
	}

	public getLatestObjectForName(name: string) {

		const hasVar = this.alHasOwnProperty(name);
		if (hasVar) {
			// there exists a avm1 var for this name. Object registration should fail
			return;
		}
		let tmpChild: DisplayObject;
		let newChild: DisplayObject;
		for (let i = 0; i < this.adaptee.numChildren; i++) {
			tmpChild = this.adaptee.getChildAt(i);
			if (tmpChild.name == name) {

				if (!newChild || newChild._avmDepthID > tmpChild._avmDepthID) {
					newChild = tmpChild;
				}
			}
		}

		//	if we have a new child to register, we register it
		//	if not, we delete the registration for this name
		if (newChild) {

			if (this.context.swfVersion < 8)
				name = name.toLowerCase();

			this._childrenByName[name] = getAVM1Object(newChild, this.context);
			if (this.unregisteredColors[name]) {
				this.unregisteredColors[name].changeTarget(newChild.adapter);
				this.unregisteredColors[name] = null;
			}
		}
	}

	private _hitArea: any;
	private _lockroot: boolean;

	private get graphics(): Graphics {
		return this.adaptee.graphics;
	}

	public initAVM1SymbolInstance(context: AVM1Context, awayObject: any) {//MovieClip
		this._childrenByName = Object.create(null);
		this._depthToChilds = Object.create(null);
		super.initAVM1SymbolInstance(context, awayObject);
		this.dragListenerDelegate = (event) => this.dragListener(event);
		this.stopDragDelegate = (event) => this.stopDrag(event);

		this.dynamicallyCreated = false;
		this.adaptee = awayObject;
		this._initEventsHandlers();
	}

	_lookupChildByName(name: string): AVM1Object {
		release || assert(alIsName(this.context, name));
		return this._childrenByName[name];
	}

	private _lookupChildInAS3Object(name: string): AVM1Object {
		//80pro todo lookupOptions
		/*let lookupOptions = LookupChildOptions.INCLUDE_NON_INITIALIZED;
		if (!this.context.isPropertyCaseSensitive) {
			lookupOptions |= LookupChildOptions.IGNORE_CASE;
		}*/
		const as3Child = this.adaptee.getChildByName(name);//, lookupOptions);
		return getAVM1Object(as3Child, this.context);
	}

	public get __targetPath() {
		//return "";
		const target = this.get_target();
		const as3Root = this.adaptee.root;
		release || Debug.assert(as3Root);
		const level = this.context.globals._getLevelForRoot(as3Root);
		release || Debug.assert(level >= 0);
		const prefix = '_level' + level;
		return target != '/' ? prefix + target.replace(/\//g, '.') : prefix;

	}

	public getAwayJSID(): number {
		return this.adaptee.id;
	}

	public attachAudio(id: any): void {
		if (isNullOrUndefined(id)) {
			return; // ignoring all undefined objects, probably nothing to attach
		}
		if (id === false) {
			return; // TODO stop playing all attached audio source (when implemented).
		}
		// TODO implement NetStream and Microphone objects to make this work.
		console.warn('[AVM1MovieClip] attachAudio not implemented');
	}

	public attachBitmap(bmp: AVM1BitmapData, depth: number,
		pixelSnapping: string = 'auto',
		smoothing: boolean = false
	): void {

		if (!bmp) {
			console.error(
				'[AVM1MovieClip:attachBitmap] Bitmap not resolved! Skip attach for prevent crash',
				this.adaptee.id
			);
			return;
		}

		pixelSnapping = alCoerceString(this.context, pixelSnapping);
		smoothing = alToBoolean(this.context, smoothing);

		const awayBitmapImage2D = bmp.as3BitmapData;
		awayBitmapImage2D.transparent = true;

		const billboard = bmp.getBillboard(pixelSnapping, smoothing);

		// bitmap not handle events
		billboard.mouseEnabled = false;

		this.addChildAtDepth(billboard, depth);
	}

	public _constructMovieClipSymbol(symbolId: string, name: string): MovieClip {
		symbolId = alToString(this.context, symbolId);
		name = alToString(this.context, name);

		const symbol = AssetLibrary.getAsset(symbolId, this.adaptee.assetNamespace);
		if (!symbol) {
			return undefined;
		}

		const mc: MovieClip = (<any>symbol.adaptee).clone();
		mc.name = name;
		getAVM1Object(mc, <any> this._avm1Context);
		return mc;
	}

	public get$version(): string {
		return '';
		//return Capabilities.version;
	}

	public rgbaToArgb(float32Color: number): number {
		const r: number = (float32Color & 0xff000000) >>> 24;
		const g: number = (float32Color & 0xff0000) >>> 16;
		const b: number = (float32Color & 0xff00) >>> 8;
		const a: number = float32Color & 0xff;
		return (a << 24) | (r << 16) | (g << 8) | b;
	}

	public attachMovie(symbolId: string, name: any, depth: number, initObject: AVM1Object) {
		if (!this._constructMovieClipSymbol)
			return;

		if (name && alIsArray(this.context, name)) {
			name = name.value[0];
		}

		const mc = this._constructMovieClipSymbol(symbolId, name);
		if (!mc) {
			return undefined;
		}

		if (!mc.name) {
			mc.name = '';
		}

		depth = alToNumber(this.context, depth);

		return this.initChildMovie(mc, name, depth, initObject, true);
	}

	private initChildMovie(
		mc: MovieClip,
		name: string,
		depth: number,
		initObject: AVM1Object,
		fromTimeline = false
	) {
		const oldAVMMC: any = this._childrenByName[name.toLowerCase()];

		mc.reset();
		mc.name = name;

		const avmMc = <AVM1MovieClip> this.addChildAtDepth(mc, avm2AwayDepth(depth));

		initObject && avmMc._init(initObject);

		if (oldAVMMC && oldAVMMC.avmColor) {
			oldAVMMC.avmColor.changeTarget(avmMc);
		}

		if (mc.timeline && mc.timeline.isButton) {
			mc.addButtonListeners();
		}

		avmMc.dynamicallyCreated = true;

		name && this.registerScriptObject(mc, fromTimeline);

		const cCtor = avmMc.executeConstructor;
		avmMc.executeConstructor = null;
		cCtor && cCtor();

		return avmMc;
	}

	public beginFill(color: number, alpha: number): void {
		color = alToInt32(this.context, color);
		if (typeof alpha == 'undefined') {
			if (arguments.length == 2) {
				// alpha was set with "undefined" variable - should be 0
				alpha = 0;
			} else if (arguments.length <= 1) {
				// alpha was not set at all - should be 100
				alpha = 100;
			}
		}
		alpha = alToNumber(this.context, alpha);
		this.graphics.beginFill(color, alpha / 100.0);
	}

	public beginBitmapFill(bmp: AVM1BitmapData, matrix: AVM1Object = null,
		repeat: boolean = true, smoothing: boolean = false): void {

		// nullable cast, return null if can't convert to as3 bitmap
		const bmpNative = toAS3BitmapData(bmp);
		if (!bmpNative) {
			return;
		}

		const matrixNative = isNullOrUndefined(matrix) ? null : toAS3Matrix(matrix);
		repeat = alToBoolean(this.context, repeat);
		smoothing = alToBoolean(this.context, smoothing);

		//console.warn('[AVM1MovieClip] beginBitmapFill not implemented');
		this.graphics.beginBitmapFill(bmpNative, matrixNative, repeat, smoothing);
	}

	public beginGradientFill(fillType: GradientType, colors: AVM1Object, alphas: AVM1Object,
		ratios: AVM1Object, matrix: AVM1Object,
		spreadMethod: string = 'pad', interpolationMethod: string = 'rgb',
		focalPointRatio: number = 0.0): void {
		const context = this.context;
		// fillType = alToString(this.context, fillType);
		const colorsNative = AVM1ArrayNative.mapToJSArray(colors, (item) => alToInt32(context, item));
		const alphasNative = AVM1ArrayNative.mapToJSArray(alphas, (item) => alToNumber(context, item) / 100.0);
		const ratiosNative = AVM1ArrayNative.mapToJSArray(ratios, (item) => alToNumber(context, item));
		const matrixNative = null;
		if (isNullOrUndefined(matrix)) {
			console.warn('[AVM1MovieClip] beginGradientFill not fully implemented');
		}
		spreadMethod = alToString(context, spreadMethod);
		interpolationMethod = alToString(context, interpolationMethod);
		focalPointRatio = alToNumber(context, focalPointRatio);
		this.graphics.beginGradientFill(fillType, colorsNative, alphasNative, ratiosNative, matrixNative,
			spreadMethod, interpolationMethod, focalPointRatio);
	}

	public _callFrame(frame: any): any {
		let scripts: IFrameScript[];

		if (typeof frame === 'string') {
			frame = frame.toLowerCase();
			scripts = this.adaptee.timeline.getScriptForLabel(this.adaptee, frame, true);
		} else if (typeof frame === 'number') {
			scripts = this.adaptee.timeline.get_script_for_frame(this.adaptee, frame - 1, true);
		}

		if (scripts)
			this.executeScript(scripts);
	}

	public clear(): void {
		this.graphics.clear();
	}

	/**
	 * This map stores the AVM1MovieClip's children keyed by their names. It's updated by all
	 * operations that can cause different results for name-based lookups. these are
	 * addition/removal of children and swapDepths.
	 *
	 * Using this map instead of always relaying lookups to the AVM2 MovieClip substantially
	 * reduces the time spent in looking up children. In some cases by two orders of magnitude.
	 */
	private _childrenByName: Record<string, AVM1SymbolBase<any>>;

	public _updateChildName(child: AVM1MovieClip, oldName: string, newName: string) {
		if (oldName === newName) {
			return;
		}

		oldName && this._removeChildName(child, oldName);
		newName && this._addChildName(child, newName);
	}

	_removeChildName(child: AVM1SymbolBase<DisplayObjectContainer>, name: string) {
		release || assert(name);
		if (!this.context.isPropertyCaseSensitive) {
			name = name.toLowerCase();
		}
		if (!this._childrenByName || !this._childrenByName[name])
			return;
		if (this._childrenByName[name] !== child) {
			return;
		}
		const newChildForName = <AVM1SymbolBase<any>> this._lookupChildInAS3Object(name);
		if (newChildForName) {
			this._childrenByName[name] = newChildForName;
		} else {
			delete this._childrenByName[name];
		}
	}

	_addChildName(child: AVM1SymbolBase<DisplayObjectContainer>, name: string) {
		release || assert(name);
		if (!this.context.isPropertyCaseSensitive) {
			name = name.toLowerCase();
		}
		release || assert(this._childrenByName[name] !== child);
		const currentChild = this._childrenByName[name];
		if (!currentChild || currentChild.getDepth() > child.getDepth()) {
			this._childrenByName[name] = child;
		}
	}

	public createEmptyMovieClip(name, depth): AVM1MovieClip {

		//	creates a new empty movieclip.
		//	if a mc already exists for the name,
		//	but at different depth, it will create a new movieclip, and also keep the existing alive
		//	if a mc already exists at same depth, it will replace the existing movieclip with the new one

		name = alToString(this.context, name);
		const mc: MovieClip = AVM1Globals._scenegraphFactory.createMovieClip();
		mc.name = name;
		mc.assetNamespace = this.adaptee.assetNamespace;

		//console.log("createEmptyMovieClip", name, avm2AwayDepth(depth));
		const avmMC: AVM1MovieClip = <AVM1MovieClip> this.addChildAtDepth(mc, avm2AwayDepth(depth));
		avmMC.dynamicallyCreated = true;
		this.registerScriptObject(mc, false);

		// set mouseEnabled to false. if any listener is applied, this will than be set back to true
		mc.mouseEnabled = false;
		//mc.mouseChildren=false;
		// dynamicallyCreated needs to be set after adding child, otherwise it gets reset
		return avmMC;
	}

	public createTextField(name, depth, x, y, width, height): AVM1TextField {
		name = alToString(this.context, name);
		const text: TextField = new TextField();
		text.name = name;
		getAVM1Object(text, <AVM1Context> this._avm1Context);
		const myTF = <AVM1TextField> this.addChildAtDepth(text, avm2AwayDepth(depth));
		this.registerScriptObject(text, false);
		text.x = x;
		text.y = y;
		text.width = width;
		text.height = height;
		myTF.dynamicallyCreated = true;
		return myTF;
	}

	public get_currentframe() {
		return this.adaptee.currentFrameIndex + 1;
	}

	public curveTo(controlX: number, controlY: number, anchorX: number, anchorY: number): void {
		controlX = alToNumber(this.context, controlX);
		controlY = alToNumber(this.context, controlY);
		anchorX = alToNumber(this.context, anchorX);
		anchorY = alToNumber(this.context, anchorY);
		this.graphics.curveTo(controlX, controlY, anchorX, anchorY);
	}

	private _dropTarget: string;
	public setDropTarget(dropTarget: DisplayObject) {
		if (dropTarget) {
			//console.log((<AVMRaycastPicker>AVM1Stage.stage.view.mousePicker).getDropTarget().name);
			const names: string[] = [];
			while (dropTarget) {
				if (dropTarget.isAVMScene) {
					dropTarget = null;
				} else {
					if (dropTarget.name != null)
						names.push(dropTarget.name);
					dropTarget = dropTarget.parent;
				}
			}
			let i: number = names.length;
			let mc_path: string = '';
			while (i > 0) {
				i--;
				if (names[i] != '')
					mc_path += '/';
				mc_path += names[i];
			}
			//console.log(mc_path);

			this._dropTarget = mc_path;
			return;

		}
		this._dropTarget = '';
	}

	public get_droptarget() {
		return this._dropTarget;

	}

	public duplicateMovieClip(name: string, depth: number, initObject?: AVM1Object): AVM1MovieClip {
		name = alToString(this.context, name);

		if (name == this.adaptee.name) {
			return this;
		}

		let parent = this.get_parent();

		if (!parent) {
			console.warn('[AVM1MovieClip] duplicateMovieClip could not get parent');
			parent = this.context.resolveTarget(null);
		}

		const mc = (<any> this).clone().adaptee;
		const avmMc = parent.initChildMovie(mc, name, depth, null, false);

		(<any>avmMc).placeObjectTag = (<any> this).placeObjectTag;
		(<any>avmMc).initEvents = (<any> this).initEvents;

		const new_matrix: Matrix3D = mc.transform.matrix3D;
		const originalMatrix: Float32Array = this.adaptee.transform.matrix3D._rawData;
		new_matrix._rawData[0] = originalMatrix[0];
		new_matrix._rawData[1] = originalMatrix[1];
		new_matrix._rawData[4] = originalMatrix[4];
		new_matrix._rawData[5] = originalMatrix[5];
		new_matrix._rawData[12] = originalMatrix[12];
		new_matrix._rawData[13] = originalMatrix[13];
		mc.transform.invalidateComponents();

		mc.alpha = this.adaptee.alpha;
		mc.blendMode = this.adaptee.blendMode;
		mc.cacheAsBitmap = this.adaptee.cacheAsBitmap;

		//filters, clone array if it exist
		const f = this.getFilters() as AVM1ArrayNative;
		f && avmMc.setFilters(new AVM1ArrayNative(this.context, f.value.slice()));

		// we should apply init after copy transform
		if (initObject) {
			avmMc._init(initObject);
		}

		return avmMc;
	}

	public endFill(): void {
		this.graphics.endFill();
	}

	public getForceSmoothing(): boolean {
		console.warn('[AVM1MovieClip] getForceSmoothing');
		return false;
	}

	public setForceSmoothing(value: boolean) {
		value = alToBoolean(this.context, value);
		console.warn('[AVM1MovieClip] setForceSmoothing');
	}

	public get_framesloaded() {
		// Unimplemented: this.adaptee.framesLoaded
		console.warn('[AVM1MovieClip] get_framesloaded');
		return this.adaptee.numFrames;
	}

	public getBounds(bounds: AVM1SymbolBase<DisplayObjectContainer>): AVM1Object {

		if (!bounds)
			return undefined;

		const box = this._stage.pickGroup
			.getBoundsPicker(this.node.partition)
			.getBoxBounds(bounds.node, true, true);

		if (!box) {
			console.warn('[AVM1 MovieClip::getBounds] Bounds is null!', this.adaptee.id);
			return undefined;
		}

		return convertAS3RectangeToBounds(box, this.context);
	}

	public getBytesLoaded(): number {
		//var loaderInfo = this.adaptee.loaderInfo;
		return this.adaptee.currentFrameIndex >= 0 ? 100 : -1;//loaderInfo.bytesLoaded;
	}

	public getBytesTotal() {
		//var loaderInfo = this.adaptee.loaderInfo;
		return 100;//loaderInfo.bytesTotal;
	}

	public getInstanceAtDepth(depth: number): AVM1MovieClip {
		const child: DisplayObject = this.getDepthToChild(avm2AwayDepth(depth));

		if (!child) {
			return null;
		}

		return <AVM1MovieClip>getAVM1Object(child, this.context);
	}

	public getNextHighestDepth(): number {
		if (this.context.swfVersion < 7)
			return 0;
		return away2avmDepth(this._nextHighestDepth);
	}

	public getRect(bounds: AVM1SymbolBase<DisplayObjectContainer>): AVM1Object {

		if (!bounds || !bounds.node)
			return undefined;

		return convertAS3RectangeToBounds(
			this._stage.pickGroup.getBoundsPicker(this.node.partition).getBoxBounds(bounds.node, false, true),
			this.context
		);
	}

	public getSWFVersion(): number {
		return this.context.swfVersion;
	}

	public getTextSnapshot() {
		console.warn('[AVM1MovieClip] getTextSnapshot');
	}

	public getURL(url: string, target: string, _method: string) {
		url = String(url);

		if (url.toLowerCase().indexOf('fscommand:') === 0) {
			console.warn('[AVM1MovieClip] fsCommand not implemented ');
			return;
		}

		window.open(url, target);
	}

	public globalToLocal(pt: AVM1Object) {
		if (!pt)
			return;
		const tmp = toAS3Point(pt);
		this.node.globalToLocal(tmp, tmp);
		copyAS3PointTo(tmp, pt);
	}

	public gotoAndPlay(frame) {
		if (this.protoTypeChanged || frame == null)
			return;
		if (Array.isArray(frame)) {
			if (frame.length == 0)
				return;
			frame = frame[0];
		}
		if (frame instanceof AVM1ArrayNative) {
			if (!frame.value || frame.value.length == 0)
				return;
			frame = frame.value[0];
		}

		if (typeof frame === 'string') {
			const labelName = frame.toLowerCase();
			if (this.adaptee.timeline._labels[labelName] == null) {
				frame = parseInt(frame);
				if (!isNaN(frame)) {
					this.adaptee.currentFrameIndex = (<number>frame) - 1;
					this.adaptee.play();
				}
				return;
			}
		}
		if (typeof frame === 'number' && frame <= 0)
			return;
		this.adaptee.play();
		this._gotoFrame(frame);
	}

	public gotoAndStop(frame: any) {
		if (this.protoTypeChanged || frame == null)
			return;

		if (Array.isArray(frame)) {
			if (frame.length == 0)
				return;
			frame = frame[0];
		}

		if (frame instanceof AVM1ArrayNative) {
			if (!frame.value || frame.value.length == 0)
				return;
			frame = frame.value[0];
		}

		if (typeof frame === 'number' && frame <= 0)
			return;
		this.adaptee.stop();
		this._gotoFrame(frame);
	}

	private _gotoFrame(frame: any): void {
		if (typeof frame === 'number') {
			if (frame % 1 !== 0) {
				frame = frame.toString();
			}
		}
		if (typeof frame === 'string') {

			const labelName = frame.toLowerCase();
			if (this.adaptee.timeline._labels[labelName] == null) {
				frame = parseInt(frame);
				if (!isNaN(frame)) {
					this.adaptee.currentFrameIndex = (<number>frame) - 1;
				}
				return;
			}
			this.adaptee.jumpToLabel(<string>labelName);
		} else {
			this.adaptee.currentFrameIndex = (<number>frame) - 1;
		}
	}

	public getHitArea() {
		return this._hitArea;
	}

	public setHitArea(value: AVM1SymbolBase<DisplayObjectContainer>) {
		// The hitArea getter always returns exactly the value set here, so we have to store that.
		this._hitArea = value;
		let obj = value ? value.node : null;
		if (obj && !obj.container.isAsset(MovieClip))
			obj = null;

		// 	MA_GBR_0700AAx0100 is the first lesson encountered that makes use of hitArea
		// 	if the hitArea is set, the mouse-interactions on the ducks stop working
		// this.adaptee.hitArea=obj;
	}

	// Alternative method signature: hitTest(target: AVM1Object): boolean
	public hitTest(object: AVM1SymbolBase<DisplayObjectContainer>): boolean;
	public hitTest(object: number, y: number, shapeFlag: boolean): boolean
	public hitTest(x: number | AVM1SymbolBase<DisplayObjectContainer>, y?: number, shapeFlag?: boolean): boolean {
		if (arguments.length < 2) {

			let target: AVM1SymbolBase<DisplayObjectContainer> = x as AVM1SymbolBase<DisplayObjectContainer>;

			if (typeof target === 'string')
				target = this.context.resolveTarget(target);

			if (target == undefined || !target.node)
				return false; // target is undefined or not a AVM1 display object, returning false.

			return AVM1Stage.avmStage.pickGroup
				.getBoundsPicker(this.node.partition)
				.hitTestObject(
					AVM1Stage.avmStage.pickGroup.getBoundsPicker(target.node.partition));
		}

		x = alToNumber(this.context, x);
		y = alToNumber(this.context, y);

		const r = this.get_root();

		if (!r) {
			if (this._hitReportCount < 10) {
				console.warn(
					'[AVM1MovieClip:: hitTest] Root return undef! Return false to prevent crash!', this.adaptee.id
				);

				this._hitReportCount++;
				if (this._hitReportCount === 10) {
					console.warn('[AVM1MovieClip:: hitTest] To many reports, supress other!');
				}
			}
			return false;
		}

		x += r.get_x();
		y += r.get_y();

		shapeFlag = alToBoolean(this.context, shapeFlag);

		return this._stage.pickGroup.getBoundsPicker(this.node.partition).hitTestPoint(x, y, shapeFlag);
	}

	public lineGradientStyle(fillType: GradientType, colors: AVM1Object, alphas: AVM1Object,
		ratios: AVM1Object, matrix: AVM1Object,
		spreadMethod: string = 'pad', interpolationMethod: string = 'rgb',
		focalPointRatio: number = 0.0): void {
		const context = this.context;
		// fillType = alToString(this.context, fillType);
		const colorsNative = AVM1ArrayNative.mapToJSArray(colors, (item) => alToInt32(context, item));
		const alphasNative = AVM1ArrayNative.mapToJSArray(alphas, (item) => alToNumber(context, item) / 100.0);
		const ratiosNative = AVM1ArrayNative.mapToJSArray(ratios, (item) => alToNumber(context, item));
		const matrixNative = null;
		if (isNullOrUndefined(matrix)) {
			somewhatImplemented('AVM1MovieClip.lineGradientStyle');
		}
		spreadMethod = alToString(context, spreadMethod);
		interpolationMethod = alToString(context, interpolationMethod);
		focalPointRatio = alToNumber(context, focalPointRatio);
		this.graphics.lineGradientStyle(
			fillType, colorsNative, alphasNative,
			ratiosNative, matrixNative, spreadMethod,
			interpolationMethod, focalPointRatio);
	}

	public lineStyle(thickness: number = NaN, rgb: number = 0x000000,
		alpha: number = 100, pixelHinting: boolean = false,
		noScale: string = 'normal', capsStyle: string = 'round',
		jointStyle: string = 'round', miterLimit: number = 3): void {
		thickness = alToNumber(this.context, thickness);
		rgb = alToInt32(this.context, rgb);
		pixelHinting = alToBoolean(this.context, pixelHinting);
		noScale = alToString(this.context, noScale);
		const capsStyleInt = AVM1MovieClip.capStyleMapStringToInt[alToString(this.context, capsStyle)];
		const jointStyleInt = AVM1MovieClip.jointStyleMapStringToInt[alToString(this.context, jointStyle)];
		miterLimit = alToNumber(this.context, miterLimit);
		this.graphics.lineStyle(
			thickness, rgb, alpha / 100.0,
			pixelHinting, AVM1MovieClip.noScaleDictionary[noScale],
			capsStyleInt, jointStyleInt, miterLimit);
	}

	public lineTo(x: number, y: number): void {
		x = toTwipFloor(alToNumber(this.context, x));
		y = toTwipFloor(alToNumber(this.context, y));
		this.graphics.lineTo(x, y);
	}

	public loadMovie(url: string, method: string) {
		const loaderHelper = new AVM1LoaderHelper(this.context);

		loaderHelper.loadMovieAt(url, method, this).then((mc: AVM1MovieClip) => {
			if (!mc) {
				warning('loadMovie - content is null');
				return;
			}
			//this.adaptee.stop();
		});
	}

	public loadVariables(url: string, method?: string) {
		(<any> this.context).actions._loadVariables(this, url, method);
	}

	public localToGlobal(pt: AVM1Object) {
		if (!pt) {
			return;
		}
		const tmp = toAS3Point(pt);
		this.node.localToGlobal(tmp, tmp);
		copyAS3PointTo(tmp, pt);
	}

	public get_lockroot(): boolean {
		return this._lockroot;
	}

	public set_lockroot(value: boolean) {
		somewhatImplemented('AVM1MovieClip._lockroot');
		this._lockroot = alToBoolean(this.context, value);
	}

	public moveTo(x: number, y: number): void {
		x = toTwipFloor(alToNumber(this.context, x));
		y = toTwipFloor(alToNumber(this.context, y));
		this.graphics.moveTo(x, y);
	}

	public nextFrame() {
		this.adaptee.stop();
		++this.adaptee.currentFrameIndex;
	}

	public nextScene() {
		console.warn('[AVM1MovieClip] nextScene not implemented');
	}

	public play() {
		this.adaptee.play();
	}

	public prevFrame() {
		this.adaptee.stop();
		--this.adaptee.currentFrameIndex;
	}

	public prevScene() {
		console.warn('[AVM1MovieClip] prevScene not implemented');
	}

	public setMask(mask: AVM1SymbolBase<DisplayObjectContainer>) {
		if (mask == null) {
			// Cancel a mask.
			this.adaptee.scriptMask = null;
			return;
		}
		mask.scriptMaskee = this;
		mask = this.context.resolveTarget(mask);

		if (mask)
			this.adaptee.scriptMask = mask.adaptee;
	}

	public startDrag(lock?: boolean, left?: number, top?: number, right?: number, bottom?: number): void {
		const stage = this._stage;

		if (AVM1MovieClip.currentDraggedMC && AVM1MovieClip.currentDraggedMC != this) {
			AVM1MovieClip.currentDraggedMC.stopDrag();
		}

		AVM1MovieClip.currentDraggedMC = this;

		lock = alToBoolean(this.context, lock);
		this._dragBounds = null;

		if (left > right) {
			[right, left] = [left, right];
		}

		if (top > bottom) {
			[top, bottom] = [bottom, top];
		}

		if (arguments.length > 1) {
			left = alToNumber(this.context, left);
			top = alToNumber(this.context, top);
			right = alToNumber(this.context, right);
			bottom = alToNumber(this.context, bottom);
			//console.log("left", left,"top", top, "right", right, "bottom", bottom );
			this._dragBounds = new Rectangle(left, top, right - left, bottom - top);
		}//todo: listen on stage

		if (this.isDragging) {
			return;
		}

		this.isDragging = true;
		const parentNode = stage.view.getNode(this.adaptee.parent);

		const localX = stage.getLocalMouseX(parentNode);
		const localY = stage.getLocalMouseY(parentNode);

		this.startDragPoint = this.startDragPoint || new Point();
		this.startDragPoint.setTo(localX, localY);

		if (lock) {
			this.adaptee.x = this.startDragPoint.x;
			this.adaptee.y = this.startDragPoint.y;
		}

		if (this._dragBounds)
			this.checkBounds();

		this.startDragMCPosition.x = this.adaptee.x;
		this.startDragMCPosition.y = this.adaptee.y;

		const dragNode = this.node;
		stage.view.stage.addEventListener(AwayMouseEvent.MOUSE_MOVE, this.dragListenerDelegate);

		// PLZ, never set this! Because this damage a dragging when it started without event
		//stage.mousePicker.dragNode = dragNode;

		const dragEntity = this.adaptee.getAbstraction<EntityNode>(dragNode.partition);
		dragEntity.setParent(dragNode);

		const collision = dragEntity
			.getAbstraction<PickEntity>(stage.mousePicker.pickGroup)
			.pickingCollision;

		// collision MUST has rootNode, otherwise will be drag bug
		collision.rootNode = dragNode;

		//console.log(collision, dragNode);
		stage.mouseManager.startDragObject(collision);

	}

	private isDragging: boolean = false;
	private startDragPoint: Point = new Point();
	private startDragMCPosition: Point = new Point();
	private _dragBounds: any;
	public dragListenerDelegate: (_e: any) => void;

	public dragListener(_e: any) {
		if (!this.adaptee.parent) {
			return;
		}

		const parentNode = this._stage.view.getNode(this.adaptee.parent);

		const localX = this._stage.getLocalMouseX(parentNode);
		const localY = this._stage.getLocalMouseY(parentNode);

		this.adaptee.x = this.startDragMCPosition.x + (localX - this.startDragPoint.x);
		this.adaptee.y = this.startDragMCPosition.y + (localY - this.startDragPoint.y);

		if (this._dragBounds)
			this.checkBounds();

	}

	public checkBounds() {

		if (this.adaptee.x < (this._dragBounds.left)) {
			this.adaptee.x = this._dragBounds.left;
		}
		if (this.adaptee.x > (this._dragBounds.right)) {
			this.adaptee.x = (this._dragBounds.right);
		}
		if (this.adaptee.y < this._dragBounds.top) {
			this.adaptee.y = this._dragBounds.top;
		}
		if (this.adaptee.y > (this._dragBounds.bottom)) {
			this.adaptee.y = this._dragBounds.bottom;
		}
	}

	public stop() {
		return this.adaptee.stop();
	}

	public stopDragDelegate: (_e: any) => void;
	public stopDrag(_e = null) {
		if (AVM1MovieClip.currentDraggedMC && AVM1MovieClip.currentDraggedMC != this) {
			AVM1MovieClip.currentDraggedMC.stopDrag();
		}

		this.isDragging = false;

		AVM1MovieClip.currentDraggedMC = null;

		this._stage.mousePicker.dragNode = null;
		this._stage.mouseManager.stopDragObject();
		this._stage.view.stage.removeEventListener(AwayMouseEvent.MOUSE_MOVE, this.dragListenerDelegate);
	}

	/**
	 * @param child1 first child that should be swapped
	 * @param child2 second child that should be swapped (optionally)
	 * @param depth1 new depth for first child
	 * @param depth2 new depth for second child (optionally)
	 */
	public swapChildrenToDepth(child1: AVM1MovieClip, child2: AVM1MovieClip, depth1: number, depth2: number): void {

		if (child2 && this._depthToChilds[depth1]) {
			// if no child2 was passed, check if there exists a child at depth1
			// depth1 is the target depth for child1, so if it is occupied we want to swap the two children
			// if its not occupied, we can just set the new depth for child1, order childs by depth and be done with it
			child2 = <AVM1MovieClip> this.getDepthToChild(depth1).adapter;
		}

		delete this.adaptee._sessionID_childs[child1.adaptee._sessionID];
		child1.adaptee._avmDepthID = depth1;
		child1.adaptee._sessionID = -1;

		this.adaptee.addChildAt(child1.adaptee, this.getIndexFromDepthOrTop(depth1));

		child1.hasSwappedDepth = true;

		this.setDepthToChild(depth1, child1.adaptee);

		if (child2) {
			delete this.adaptee._sessionID_childs[child2.adaptee._sessionID];

			this.setDepthToChild(depth2, child2.adaptee);

			child2.adaptee._avmDepthID = depth2;
			child2.adaptee._sessionID = -1;

			this.adaptee.addChildAt(child2.adaptee, this.getIndexFromDepthOrTop(depth2));

			child2.hasSwappedDepth = true;
		} else {
			this.setDepthToChild(depth2);
		}

		// re-trap a events, new depth require update mapping for it
		child1 && child1.updateAllEvents();
		child2 && child2.updateAllEvents();

		if (this.adaptee.name && parent) {
			// we need to check if child registration must be updated
			this.getLatestObjectForName(child1.adaptee.name);
			if (child2) {
				this.getLatestObjectForName(child2.adaptee.name);
			}
		}

	}

	public swapDepths(target: any): void {

		// if this is the scene, or if no parent exists, we do not want to do anything
		if (this.adaptee.isAVMScene || !this.get_parent()) {
			return;
		}
		const parent: AVM1MovieClip = this.get_parent();
		let targetChild: any = null;
		if (!parent) {
			console.warn('[AVM1MovieClip] swapDepth called for object with no parent');
			return;
		}
		if (typeof target === 'undefined') {
			console.warn('[AVM1MovieClip] swapDepth called with undefined as target depth');
			return;
		}
		if (typeof target === 'number') {
			target = avm2AwayDepth(target);
			if (this.adaptee._avmDepthID == target)
				return;

			//targetChild = parent._depthToChilds[target];
			targetChild = parent.getDepthToChild(target);
			if (targetChild) {
				targetChild = targetChild.adapter;
			}

			//console.log("swap to number", this.adaptee.name, target);
		} else if (target.adaptee) {
			const targetParent = target.get_parent();
			if (targetParent != parent)
				return;
			targetChild = target;
			target = targetChild.adaptee._avmDepthID;
			//console.log("swap to children", this.adaptee.name, target.adaptee.name);
		}
		parent.swapChildrenToDepth(this, targetChild, target, this.adaptee._avmDepthID);
	}

	public getTabChildren(): boolean {
		return getAwayObjectOrTemplate(this).tabChildren;
	}

	public setTabChildren(value: boolean) {
		getAwayObjectOrTemplate(this).tabChildren = alToBoolean(this.context, value);
	}

	public get_totalframes(): number {
		return this.adaptee.numFrames;
	}

	public getTrackAsMenu(): boolean {
		console.warn('[AVM1MovieClip] getTrackAsMenu not implemented');
		return getAwayObjectOrTemplate(this).trackAsMenu;
	}

	public setTrackAsMenu(value: boolean) {
		console.warn('[AVM1MovieClip] setTrackAsMenu not implemented');
		getAwayObjectOrTemplate(this).trackAsMenu = alToBoolean(this.context, value);
	}

	public unloadMovie() {
		const nativeObject = this.adaptee;
		this.adaptee.constructedKeyFrameIndex = 0;
		this.adaptee.stop();
		nativeObject.removeChildren(0, nativeObject.numChildren);
		if ((this.dynamicallyCreated || this.hasSwappedDepth) && nativeObject.parent && nativeObject.parent.adapter) {
			(<AVM1MovieClip>nativeObject.parent.adapter).unregisterScriptObject(nativeObject);
		}
	}

	public getUseHandCursor() {
		return this.adaptee.useHandCursor;
	}

	public setUseHandCursor(value: boolean) {
		if (!this.adaptee)
			return;
		this.adaptee.useHandCursor = value;
	}

	public setParameters(parameters: any): any {
		for (const paramName in parameters) {
			if (!this.alHasProperty(paramName)) {
				this.alPut(paramName, parameters[paramName]);
			}
		}
	}

	// Special and children names properties resolutions

	private _resolveLevelNProperty(name: string): AVM1MovieClip {
		release || assert(alIsName(this.context, name));
		if (name === '_level0' || name === '_level') {
			return this.context.resolveRoot();
		} else if (name === '_root') {
			return this.context.resolveRoot();
		} else if (name.indexOf('_level') === 0) {
			const level = name.substring(6);
			const levelNum = <any>level | 0;
			if (levelNum > 0 && <any>level == levelNum) {
				return this.context.resolveLevel(levelNum);
			}
		}
		return null;
	}

	private _cachedPropertyResult: any;
	private _getCachedPropertyResult(value: any) {
		if (!this._cachedPropertyResult) {
			this._cachedPropertyResult = {
				flags: AVM1PropertyFlags.DATA | AVM1PropertyFlags.DONT_ENUM, value: value
			};
		} else {
			this._cachedPropertyResult.value = value;
		}
		return this._cachedPropertyResult;
	}

	public alGetOwnProperty(name: string): AVM1PropertyDescriptor {
		const desc = super.alGetOwnProperty(name);
		if (desc) {
			return desc;
		}
		if (name[0] === '_') {
			if ((name[1] === 'l' && name.indexOf('_level') === 0 ||
				name[1] === 'r' && name.indexOf('_root') === 0)) {
				const level = this._resolveLevelNProperty(name);
				if (level) {
					return this._getCachedPropertyResult(level);
				}
			} else if (name.toLowerCase() in MovieClipProperties) {
				// For MovieClip's properties that start from '_' case does not matter.
				return super.alGetOwnProperty(name.toLowerCase());
			}
		}
		if (hasAwayJSAdaptee(this)) {
			const child = this._lookupChildByName(name);
			if (child) {
				return this._getCachedPropertyResult(child);
			}
		}
		return undefined;
	}

	public alGetOwnPropertiesKeys(): any[] {
		const keys = super.alGetOwnPropertiesKeys();
		// if it's a movie listing the children as well
		if (!hasAwayJSAdaptee(this)) {
			return keys; // not initialized yet
		}

		const processed: any = Object.assign(Object.create(null), this._childrenByName);

		for (const key of keys) {
			processed[key] = true;
		}

		return Object.keys(processed);
	}

	private _init(initObject: AVM1Object) {
		if (initObject instanceof AVM1Object) {
			alForEachProperty(initObject, (name: string) => {
				this.alPut(name, initObject.alGet(name));
			}, null);
		}
	}

	protected _initEventsHandlers() {
		this.bindEvents(EventsListForMC);
	}
}
