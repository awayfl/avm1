import { BitmapImage2D, Image2D } from '@awayjs/stage';
import { IFrameScript, Timeline, MovieClip, Sprite, DisplayObjectContainer, Billboard,
	ISceneGraphFactory, TextField, PrefabBase, DefaultSceneGraphFactory, MorphSprite, DisplayObject, FrameScriptManager } from '@awayjs/scene';
import { MaterialBase, MethodMaterial } from '@awayjs/materials';
import { AVM1Context } from './context';
import { getAVM1Object } from './lib/AVM1Utils';
import { BasicPartition } from '@awayjs/view';
import { Graphics } from '@awayjs/graphics';
import { IAsset } from '@awayjs/core';

export class AVM1SceneGraphFactory extends DefaultSceneGraphFactory implements ISceneGraphFactory {
	public static _instance: AVM1SceneGraphFactory;
	public static get instance(): AVM1SceneGraphFactory {
		if (!AVM1SceneGraphFactory._instance) {
			console.log('Error. A instance of AVM1SceneGraphFactory must be created manually \
				before accessing the singleton AVM1SceneGraphFactory._instance');
			//AVM1SceneGraphFactory._instance=new AVM1SceneGraphFactory();
		}
		return AVM1SceneGraphFactory._instance;
	}

	public imageStore: Object = {};
	public avm1Context: AVM1Context;

	constructor(avm1Context: AVM1Context) {
		super();
		this.avm1Context = avm1Context;
		AVM1SceneGraphFactory._instance = this;
	}

	public createSprite(prefab: PrefabBase = null): Sprite {
		return new Sprite();
	}

	public createDisplayObjectContainer(): DisplayObjectContainer {
		return new DisplayObjectContainer();
	}

	public createMovieClip(timeline: Timeline = null, symbol: any = null): MovieClip {
		const awayMovieClip: MovieClip = new MovieClip(timeline || new Timeline(this));
		getAVM1Object(awayMovieClip, this.avm1Context);
		awayMovieClip._symbol = symbol;
		return awayMovieClip;
	}

	public createTextField(): TextField {
		const awayTextfield: TextField = new TextField();
		awayTextfield.multiline = true;
		awayTextfield.wordWrap = true;
		getAVM1Object(awayTextfield, this.avm1Context);
		return awayTextfield;
	}

	public createBillboard(material: MaterialBase): Billboard {
		return null;//new Billboard();
	}

	public createImage2D(width: number, height: number,
		transparent: boolean = true,
		fillColor: number = null,
		powerOfTwo: boolean = true): Image2D {
		return new BitmapImage2D(width, height, transparent, fillColor, powerOfTwo);
	}

	public createFrameScripts(scripts: IFrameScript[], frameIdx: number, objName: string, objID: number) {

		objName = objName.replace(/[^\w]/g, '');

		const outputFrameScripts: IFrameScript[] = [];

		for (let i = 0; i < scripts.length; i++) {
			const script = scripts[i];
			script.data = this.avm1Context.actionsDataFactory.createActionsData(
				<any>script, 'script_' + name + '_' + objID + '_frame_' + frameIdx + '_idx_' + i);
			outputFrameScripts[outputFrameScripts.length] = script;
		}
		if (outputFrameScripts.length) {
			outputFrameScripts.sort(this.compareAVM1FrameScripts);
		}
		return outputFrameScripts;
	}

	/**
	 * Get a instance for a given SymbolID and assign a sessionID to it.
	 * This is used by timeline to create children
	 *
	 * @param symbolID
	 * @param sessionID
	 */
	public createChildInstanceForTimeline(timeline: Timeline, symbolID: number, sessionID: number): IAsset {

		// if this was called we might have new constructors from timeline to process
		FrameScriptManager.invalidAS3Constructors = true;

		const asset: IAsset = this.awaySymbols[symbolID];
		let clone: DisplayObject;
		if (asset.isAsset(Graphics)) {
			clone = Sprite.getNewSprite(<Graphics> asset.clone());//TODO: remove this clone() without the mem leak
			clone.mouseEnabled = false;
		} else if (asset.isAsset(Sprite)) {
			clone = Sprite.getNewSprite((<Sprite> asset).graphics);
			clone.mouseEnabled = false;
		} else if (asset.isAsset(MorphSprite)) {
			clone = MorphSprite.getNewMorphSprite((<MorphSprite> asset).graphics.clone());
			clone.mouseEnabled = false;
		} else if (asset.isAsset(BitmapImage2D)) {
			// enable blending for symbols, because if you place image directly on stage
			// it not enable blend mode
			const m = new MethodMaterial(<BitmapImage2D>asset);
			m.alphaBlending = (<BitmapImage2D>asset).transparent;
			clone = Billboard.getNewBillboard(m);
			clone.mouseEnabled = false;
		} else {
			clone = (<any> asset.adapter).clone(false).adaptee;
		}

		const placeObjectTag: any = timeline.placeObjectTagsForSessionIDs[sessionID];
		if (placeObjectTag
			&& ((<any>placeObjectTag).variableName
			|| (placeObjectTag.events && placeObjectTag.events.length > 0))) {
			(<any>clone.adapter).placeObjectTag = placeObjectTag;
			(<any>clone.adapter).initEvents = placeObjectTag;
		}

		clone.partitionClass = BasicPartition;
		clone._sessionID = sessionID;
		return clone;
	}

	// this is used for ordering AVM1 Framescripts into correct order
	private compareAVM1FrameScripts(a: IFrameScript, b: IFrameScript): number {
		if (!a.precedence) {
			return !b.precedence ? 0 : -1;
		} else if (!b.precedence) {
			return 1;
		}
		let i = 0;
		while (i < a.precedence.length && i < b.precedence.length && a.precedence[i] === b.precedence[i]) {
			i++;
		}
		if (i >= a.precedence.length) {
			return a.precedence.length === b.precedence.length ? 0 : -1;
		} else {
			return i >= b.precedence.length ? 1 : a.precedence[i] - b.precedence[i];
		}
	}
}