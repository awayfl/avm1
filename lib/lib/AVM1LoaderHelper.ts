import { SWFParser, PromiseWrapper, matchRedirect } from "@awayfl/swf-loader";
import {AVM1Globals} from "./AVM1Globals";
import { Loader, URLLoaderEvent, LoaderEvent, AssetEvent, IAsset, AssetLibrary, URLRequest } from "@awayjs/core";
import { AVM1Context } from "../context";
import { DisplayObject, MovieClip } from "@awayjs/scene";
import { AVM1MovieClip } from './AVM1MovieClip';

export class AVM1LoaderHelper {
	private static _loaderCache: StringMap<MovieClip> = {};

	private _loader:Loader;
	private _context: AVM1Context;
	private _content: DisplayObject;
	private result = new PromiseWrapper<DisplayObject>();
	private _url:string;

	public get loader(): Loader {
		return this._loader;
	}

	public get content(): DisplayObject {
		return this._content;
	}

	public constructor(context: AVM1Context) {
		this._context = context;
		this._onAssetCompleteDelegate = (event: AssetEvent) => this.onAssetComplete(event);
		this._onLoaderCompleteDelegate = (event: LoaderEvent) => this.onLoaderComplete(event);
		this._onLoadErrorDelegate = (event: URLLoaderEvent) => this.onLoadError(event);
		this._loader = new Loader();
	}

	private _onAssetCompleteDelegate: (event: AssetEvent) => void;

	private onAssetComplete(event: AssetEvent): void {
		var asset: IAsset = event.asset;
		if (asset.isAsset(MovieClip)) {
			if(asset.assetNamespace!=this._url){
				return;
			}
			if ((<any>asset).isAVMScene) {
				this._content=<MovieClip>asset;
                this.result.resolve(<MovieClip>asset);
                (<any>asset.adapter).initAdapter();
			}
		}
	}

	private _onLoaderCompleteDelegate: (event: LoaderEvent) => void;

	private onLoaderComplete(event: LoaderEvent): void {
		if(event.url!=this._url){
			return;
		}
		AssetLibrary.removeEventListener(AssetEvent.ASSET_COMPLETE, this._onAssetCompleteDelegate);
		AssetLibrary.removeEventListener(LoaderEvent.LOADER_COMPLETE, this._onLoaderCompleteDelegate);
		AssetLibrary.removeEventListener(URLLoaderEvent.LOAD_ERROR, this._onLoadErrorDelegate);
	}

	private _onLoadErrorDelegate: (event: URLLoaderEvent) => void;

	private onLoadError(event: URLLoaderEvent): void {
		AssetLibrary.removeEventListener(AssetEvent.ASSET_COMPLETE, this._onAssetCompleteDelegate);
		AssetLibrary.removeEventListener(LoaderEvent.LOADER_COMPLETE, this._onLoaderCompleteDelegate);
		AssetLibrary.removeEventListener(URLLoaderEvent.LOAD_ERROR, this._onLoadErrorDelegate);
		console.log("load error in loadMovie", event);
	}

	private _loadingCallback(source: MovieClip, target: AVM1MovieClip) {		
		const t = target.adaptee;
		const c = source;

		t.isAVMScene = c.isAVMScene;
		t.timeline = c.timeline;
		t.assetNamespace = c.assetNamespace;
		//t.reset(true);
	}

	public loadMovieAt(url: string, method: string, target: AVM1MovieClip): Promise<AVM1MovieClip | null>
	{
		if(!target) {
			throw new Error("Target can't be null");
		}

		let source = AVM1LoaderHelper._loaderCache[url];

		
		if (source) {
			this._loadingCallback(source, target);
			return Promise.resolve(target)
		}

		return this.load(url, method).then(()=>{
			source = <MovieClip>this.content;

			if(!source) {
				return null;
			}

			AVM1LoaderHelper._loaderCache[url] = source;
			this._loadingCallback(source, target);
			return target;
		})
	}

	public load(url: string, method: string): Promise<DisplayObject> {

		/*
		const rule = matchRedirect(url);
		if(rule) {
			url = rule.url;
		}*/

		this._url = url;
		this.result = new PromiseWrapper<DisplayObject>();
		AssetLibrary.addEventListener(AssetEvent.ASSET_COMPLETE, this._onAssetCompleteDelegate);
		AssetLibrary.addEventListener(LoaderEvent.LOADER_COMPLETE, this._onLoaderCompleteDelegate);
		AssetLibrary.addEventListener(URLLoaderEvent.LOAD_ERROR, this._onLoadErrorDelegate);
		AssetLibrary.load(new URLRequest(url), null, url, new SWFParser(AVM1Globals._scenegraphFactory));
		return this.result.promise;

		/*
		todo:
		
		var context = this._context;
		var loader = this._loader;
		var loaderContext: LoaderContext = new context.sec.flash.system.LoaderContext();
		loaderContext._avm1Context = context;
		var request = new context.sec.flash.net.URLRequest(url);
		if (method) {
			request.method = method;
		}

		var loaderInfo = loader.contentLoaderInfo;
		// Waiting for content in the progress event -- the result promise will be resolved
		// as soon as loader's content will be set to non-empty value.
		var progressEventHandler = function (e: ProgressEvent): void {
			if (!loader._content) {
				return;
			}
			loaderInfo.removeEventListener(ProgressEvent.PROGRESS, progressEventHandler);
			result.resolve(loader._content);

		};
		loaderInfo.addEventListener(ProgressEvent.PROGRESS, progressEventHandler);
		loader.load(request, loaderContext);
		*/

		//return null;

	}
}
