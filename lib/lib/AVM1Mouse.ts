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

import { alCallProperty } from '../runtime';
import { AVM1Context } from '../context';
import { wrapAVM1NativeClass } from './AVM1Utils';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Stage } from './AVM1Stage';
import { AVM1Globals } from './AVM1Globals';
import { AVMStage } from '@awayfl/swf-loader';
import { MouseButtons, MouseEvent as AwayMouseEvent } from '@awayjs/scene';
import { Stage } from '@awayjs/stage';

export const enum ASNativeMouseCodes {
	NONE = 0,
	LEFT = 1,
	RIGHT = 2,
	MIDDLE = 4,
}

export class AVM1Mouse extends AVM1Object {
	public static createAVM1Class(context: AVM1Context): AVM1Object {
		const wrapped = wrapAVM1NativeClass(context, false, AVM1Mouse, ['show', 'hide'], []);
		return wrapped;
	}

	public static mouseButtonsState = {
		[ASNativeMouseCodes.LEFT]: 0,
		[ASNativeMouseCodes.MIDDLE]: 0,
		[ASNativeMouseCodes.RIGHT]: 0,
	};

	public static mouseDownDelegate: any = null;
	public static mouseMoveDelegate: any = null;
	public static mouseOutDelegate: any = null;
	public static mouseUpDelegate: any = null;

	public static bindStage (
		_context: AVM1Context,
		cls: AVM1Object,
		avmStage: AVMStage,
		_htmlElement: HTMLElement
	): void {

		AVM1Mouse.mouseButtonsState[ASNativeMouseCodes.LEFT] = 0;
		AVM1Mouse.mouseButtonsState[ASNativeMouseCodes.MIDDLE] = 0;
		AVM1Mouse.mouseButtonsState[ASNativeMouseCodes.RIGHT] = 0;

		const stage: Stage = avmStage.view.stage;

		if (AVM1Mouse.mouseDownDelegate)
			stage.removeEventListener(AwayMouseEvent.MOUSE_DOWN, AVM1Mouse.mouseDownDelegate);
		if (AVM1Mouse.mouseMoveDelegate)
			stage.removeEventListener(AwayMouseEvent.MOUSE_MOVE, AVM1Mouse.mouseMoveDelegate);
		if (AVM1Mouse.mouseOutDelegate)
			stage.removeEventListener(AwayMouseEvent.MOUSE_OUT, AVM1Mouse.mouseOutDelegate);
		if (AVM1Mouse.mouseUpDelegate)
			stage.removeEventListener(AwayMouseEvent.MOUSE_UP, AVM1Mouse.mouseUpDelegate);

		AVM1Mouse.mouseDownDelegate = (e: AwayMouseEvent) => {
			// ?? = (a === undef || null) ? b : a;
			const buttons = e.buttons ?? 0;

			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.PRIMARY_BUTTON] = 1;
			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.SECONDARY_BUTTON] = 1;
			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.AUXILLARY_BUTTON] = 1;

			// we should not handle middle mouse, because FLASH can use it
			if (buttons === 4) {
				return;
			}

			alCallProperty(cls, 'broadcastMessage', ['onMouseDown']);
		};

		AVM1Mouse.mouseMoveDelegate = (_e: AwayMouseEvent) => {
			alCallProperty(cls, 'broadcastMessage', ['onMouseMove']);
		};

		AVM1Mouse.mouseOutDelegate = (_e: AwayMouseEvent)=>{
			alCallProperty(cls, 'broadcastMessage', ['onMouseOut']);
		};

		AVM1Mouse.mouseUpDelegate = (e: AwayMouseEvent)=>{

			// ?? = (a === undef || null) ? b : a;
			const buttons = e.buttons ?? 0;

			// reset latest mouse,  but this is not fully valid implementation
			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.PRIMARY_BUTTON] = 1;
			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.SECONDARY_BUTTON] = 1;
			AVM1Mouse.mouseButtonsState[buttons & MouseButtons.AUXILLARY_BUTTON] = 1;

			// we should not handle middle mouse, because FLASH can't use it
			if (buttons === 4) {
				return;
			}

			alCallProperty(cls, 'broadcastMessage', ['onMouseUp']);
		};

		stage.addEventListener(AwayMouseEvent.MOUSE_DOWN, AVM1Mouse.mouseDownDelegate);
		stage.addEventListener(AwayMouseEvent.MOUSE_MOVE, AVM1Mouse.mouseMoveDelegate);
		stage.addEventListener(AwayMouseEvent.MOUSE_OUT, AVM1Mouse.mouseOutDelegate);
		stage.addEventListener(AwayMouseEvent.MOUSE_UP, AVM1Mouse.mouseUpDelegate);
	}

	public static hide() {
		(<AVM1Stage>AVM1Globals.instance.Stage).avmStage.mouseManager.showCursor = false;
	}

	public static show() {
		(<AVM1Stage>AVM1Globals.instance.Stage).avmStage.mouseManager.showCursor = true;
	}
}
