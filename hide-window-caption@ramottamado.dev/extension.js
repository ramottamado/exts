// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class HideWindowCaptionExtension extends Extension {
    /** */
    enable() { console.log("HideWindowCaptionExtension enabled.") }

    /** */
    disable() { console.log("HideWindowCaptionExtension disabled.") }
}