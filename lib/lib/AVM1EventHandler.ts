
import { AVM1ClipEvents } from '@awayfl/swf-loader';
import { MouseEvent, KeyboardEvent, FocusEvent, TextfieldEvent } from '@awayjs/scene';

export class AVM1EventHandler {
	constructor(public propertyName: string,
		public eventName: string,
		public stageEvent: boolean,
		public allowDisable: boolean,
		public isMouse: boolean,
		public isButton: boolean) { }
}

export class AVM1EventProps {
	public keyCode: number
	constructor() { }
}
/**
 * Key codes below 32 aren't interpreted as char codes, but are mapped to specific buttons instead.
 * This array uses the key code as the index and KeyboardEvent.keyCode values matching the
 * specific keys as the value.
 * @type {number[]}
 */
export const AVM1KeyCodeMap = [-1, 37, 39, 36, 35, 45, 46, -1, 8, -1, -1, -1, -1, 13, 38, 40, 33, 34, 9, 27];
export const ClipEventMappings = Object.create(null);

const cem = ClipEventMappings;
const EH = AVM1EventHandler;

cem[AVM1ClipEvents.Construct] = true;
cem[AVM1ClipEvents.Initialize] = true;

cem[AVM1ClipEvents.KeyPress] = new EH('onKey', KeyboardEvent.KEYDOWN, true, true, false, false);

cem[AVM1ClipEvents.Load] = new EH('onLoad', 'load', false, false, false, false);
cem[AVM1ClipEvents.Unload] = new EH('onUnload', 'unload', false, false, false, false),
cem[AVM1ClipEvents.Data] = new EH('onData', 'data', false, false, false, false),
cem[AVM1ClipEvents.EnterFrame] = new EH('onEnterFrame', 'enterFrame', false, false, false, false),
cem[AVM1ClipEvents.KeyDown] = new EH('onKeyDown', KeyboardEvent.KEYDOWN, true, true, false, false);
cem[AVM1ClipEvents.KeyUp] = new EH('onKeyUp', KeyboardEvent.KEYUP, true, true, false, false);

cem[AVM1ClipEvents.MouseMove] = new EH('onMouseMove', MouseEvent.MOUSE_MOVE, true, true, true, false);
cem[AVM1ClipEvents.MouseDown] = new EH('onMouseDown', MouseEvent.MOUSE_DOWN, true, true, true, false);
cem[AVM1ClipEvents.MouseUp] = new EH('onMouseUp', MouseEvent.MOUSE_UP, true, true, true, false);
cem[AVM1ClipEvents.Press] = new EH('onPress', MouseEvent.MOUSE_DOWN, false, true, true, true);
cem[AVM1ClipEvents.Release] = new EH('onRelease', MouseEvent.MOUSE_UP, false, true, true, true);
cem[AVM1ClipEvents.ReleaseOutside] = new EH('onReleaseOutside', MouseEvent.MOUSE_UP_OUTSIDE, false, true, true, true);
cem[AVM1ClipEvents.RollOver] = new EH('onRollOver', MouseEvent.MOUSE_OVER, false, true, true, true);
cem[AVM1ClipEvents.RollOut] = new EH('onRollOut', MouseEvent.MOUSE_OUT, false, true, true, true);
cem[AVM1ClipEvents.DragOver] = new EH('onDragOver', MouseEvent.DRAG_OVER, false, true, true, true);
cem[AVM1ClipEvents.DragOut] = new EH('onDragOut', MouseEvent.DRAG_OUT, false, true, true, true);

const setFocusEventMapping = new EH('onSetFocus', FocusEvent.FOCUS_IN, false, true, false, false);
const unFocusEventMapping = new EH('onKillFocus', FocusEvent.FOCUS_OUT, false, true, false, false);
const onChangedEventMapping = new EH('onChanged', TextfieldEvent.CHANGED, false, true, false, false);

export const EventsListForMC: AVM1EventHandler[] = [
	ClipEventMappings[AVM1ClipEvents.Load],
	ClipEventMappings[AVM1ClipEvents.Unload],
	ClipEventMappings[AVM1ClipEvents.Data],
	ClipEventMappings[AVM1ClipEvents.EnterFrame],
	ClipEventMappings[AVM1ClipEvents.KeyDown],
	ClipEventMappings[AVM1ClipEvents.KeyUp],
	ClipEventMappings[AVM1ClipEvents.MouseMove],
	ClipEventMappings[AVM1ClipEvents.MouseDown],
	ClipEventMappings[AVM1ClipEvents.MouseUp],
	ClipEventMappings[AVM1ClipEvents.Press],
	ClipEventMappings[AVM1ClipEvents.Release],
	ClipEventMappings[AVM1ClipEvents.ReleaseOutside],
	ClipEventMappings[AVM1ClipEvents.RollOver],
	ClipEventMappings[AVM1ClipEvents.RollOut],
	ClipEventMappings[AVM1ClipEvents.DragOver],
	ClipEventMappings[AVM1ClipEvents.DragOut],
	ClipEventMappings[AVM1ClipEvents.KeyPress],
	setFocusEventMapping,
	unFocusEventMapping,
	onChangedEventMapping
];
export const EventsListForButton: AVM1EventHandler[] = [
	ClipEventMappings[AVM1ClipEvents.Load],
	ClipEventMappings[AVM1ClipEvents.Unload],
	ClipEventMappings[AVM1ClipEvents.Data],
	ClipEventMappings[AVM1ClipEvents.EnterFrame],
	ClipEventMappings[AVM1ClipEvents.KeyDown],
	ClipEventMappings[AVM1ClipEvents.KeyUp],
	ClipEventMappings[AVM1ClipEvents.Press],
	ClipEventMappings[AVM1ClipEvents.Release],
	ClipEventMappings[AVM1ClipEvents.ReleaseOutside],
	ClipEventMappings[AVM1ClipEvents.RollOver],
	ClipEventMappings[AVM1ClipEvents.RollOut],
	ClipEventMappings[AVM1ClipEvents.DragOver],
	ClipEventMappings[AVM1ClipEvents.DragOut],
	ClipEventMappings[AVM1ClipEvents.KeyPress],
	setFocusEventMapping,
	unFocusEventMapping,
	onChangedEventMapping
];
