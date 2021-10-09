/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

'use strict';

const { Gio, St, Clutter } = imports.gi;
const Main = imports.ui.main;
const Panel = imports.ui.panel;

class Extension {
    constructor() {
        this._activitiesBtn = { icon: null, container: null };
    }

    enable() {
        let activities = Main.panel.statusArea['activities'];

        let iconSize = Panel.PANEL_ICON_SIZE - Panel.APP_MENU_ICON_MARGIN;

        this._activitiesBtn.icon = new St.Icon({
            icon_size: iconSize,
            style_class: 'fedora-activities-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });

        let file = Gio.File.new_for_uri('file:///usr/share/icons/Bluecurve/256x256/apps/start-here.png');
        let filePathExists = file.query_exists(null);

        if (!filePathExists) {
            this._activitiesBtn.icon.set_icon_name('start-here');

            return;
        }

        let gicon = Gio.icon_new_for_string(file.get_path());

        this._activitiesBtn.icon.set_gicon(gicon);

        activities.remove_actor(activities.label_actor);

        this._activitiesBtn.container = new St.BoxLayout();
        this._activitiesBtn.container.add_actor(this._activitiesBtn.icon);
        this._activitiesBtn.container.add_actor(activities.label_actor);

        activities.add_actor(this._activitiesBtn.container);
    }

    disable() {
        let activities = Main.panel.statusArea['activities'];

        if (!this._activitiesBtn) {
            return;
        }

        if (this._activitiesBtn.container) {
            this._activitiesBtn.container.remove_actor(this._activitiesBtn.icon);
            this._activitiesBtn.container.remove_actor(activities.label_actor);
            activities.remove_actor(this._activitiesBtn.container);
            this._activitiesBtn.icon = null;
            this._activitiesBtn.container = null;
        }

        if (!activities.contains(activities.label_actor)) {
            activities.add_actor(activities.label_actor);
        }
    }
}

function init() {
    return new Extension();
}
