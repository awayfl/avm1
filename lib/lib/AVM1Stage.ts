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

import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Context } from '../context';
import { wrapAVM1NativeMembers } from './AVM1Utils';
import { Rectangle } from '@awayjs/core';
import { AVMStage, release } from '@awayfl/swf-loader';
import { AVM1Handler } from '../AVM1Handler';

export class AVM1Stage extends AVM1Object {
	public static avmStage: AVMStage;
	public static createAVM1Class(context: AVM1Context): AVM1Object {
		const wrapped = new AVM1Stage(context);
		wrapAVM1NativeMembers(context, wrapped, AVM1Stage.prototype,
			['align#', 'displayState#', 'fullScreenSourceRect#', 'height#',
				'scaleMode#', 'showMenu#', 'width#'],
			false);
		return wrapped;
	}

	public static bindStage(
		context: AVM1Context, cls: AVM1Object, avmStage: AVMStage,
		avm1Handler: AVM1Handler, htmlElement: HTMLElement): void  {
		(<AVM1Stage>cls).avmStage = avmStage;
		(<AVM1Stage>cls).avm1Handler = avm1Handler;
		AVM1Stage.avmStage = avmStage;

	}

	public avmStage: AVMStage;
	public avm1Handler: AVM1Handler;

	public getAlign() { return this.avmStage.align; }
	public setAlign(value) { this.avmStage.align = value; }

	public getDisplayState() {
		//release || console.log("not implemented AVM1Stage.getDisplayState")
		//return this._stage.displayState;
		return this.avmStage.displayState;
	}

	public setDisplayState(value) {
		//release || console.log("not implemented AVM1Stage.setDisplayState")
		//this._stage.displayState = value;
		this.avmStage.displayState = value;
	}

	public getFullScreenSourceRect(): Rectangle {
		release || console.log('not implemented AVM1Stage.getFullScreenSourceRect');
		//return this._stage.fullScreenSourceRect;
		return null;
	}

	public setFullScreenSourceRect(value: Rectangle) {
		release || console.log('not implemented AVM1Stage.setFullScreenSourceRect');
		//this._stage.fullScreenSourceRect = value;
	}

	public getHeight() { return this.avmStage.stageHeight; }

	public getScaleMode() { return this.avmStage.scaleMode; }
	public setScaleMode(value) { this.avmStage.scaleMode = value; }

	public getShowMenu() {
		release || console.log('not implemented AVM1Stage.getShowMenu');
		//return this._stage.showDefaultContextMenu;
		return null;
	}

	public setShowMenu(value) {
		release || console.log('not implemented AVM1Stage.setShowMenu');
		//this._stage.showDefaultContextMenu = value;
	}

	public getWidth() { return this.avmStage.stageWidth; }
}
