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
import { DisplayObject as AwayDisplayObject } from "@awayjs/scene";


export class AVM1Movie extends AwayDisplayObject {
	_getLevelForRoot(root: AwayDisplayObject): number{return 0;};
	_getRootForLevel(level: number): AwayDisplayObject{return null;};
	_addRoot(level: number, root: AwayDisplayObject): void{};
	_removeRoot(level: number): void{};
}
export class ContextMenu{}
export class ContextMenuItem{}
export class fscommand{}
export class Security{}
export class Capabilities{}
export class ExternalInterface{}
export class Mouse{}
export class SoundChannel{}
export class SoundTransform{}
export class SoundMixer{}