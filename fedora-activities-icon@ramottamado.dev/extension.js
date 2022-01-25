/**
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Author: Tamado Sitohang <ramot@ramottamado.dev>
 *         Javad Rahmatzadeh <eon@patapon.info>
 * Based on Just Perfection GNOME shell extension from: Javad Rahmatzadeh
 */

/* exported init */

'use strict';

const { Gio, St, Clutter } = imports.gi;
const Main = imports.ui.main;
const Panel = imports.ui.panel;

const ICON_SIZE = Panel.PANEL_ICON_SIZE - Panel.APP_MENU_ICON_MARGIN;

class FedoraActivitiesIcon {
    constructor() {
        this._bin = null;
        this._iconBox = null;
        this._container = null;
    }

    enable() {
        let activities = Main.panel.statusArea['activities'];

        activities.remove_actor(activities.label_actor);

        this._bin = new St.Bin({
            name: 'fedoraOverview'
        });

        this._iconBox = new St.Bin({
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._iconBox.set_child(this._icon);

        this._container = new St.BoxLayout({
            style_class: 'fedora-overview-container'
        });

        this._bin.set_child(this._container);

        this._container.add_child(this._iconBox);
        this._container.add_child(activities.label_actor);

        activities.add_actor(this._bin);
    }

    disable() {
        let activities = Main.panel.statusArea['activities'];

        if (!this._container) {
            return;
        }

        if (this._container) {
            this._container.remove_actor(this._iconBox);
            this._container.remove_actor(activities.label_actor);

            activities.remove_actor(this._bin);
            this._bin = null;
            this._iconBox = null;
            this._container = null;
        }

        if (!activities.contains(activities.label_actor)) {
            activities.add_actor(activities.label_actor);
        }
    }

    get _icon() {
        let icon = new St.Icon({
            icon_size: ICON_SIZE
        });

        let file = Gio.File.new_for_uri(
            'file:///usr/share/icons/Bluecurve/'
            + ICON_SIZE.toString()
            + 'x'
            + ICON_SIZE.toString()
            + '/apps/start-here.png');

        let filePathExists = file.query_exists(null);

        if (!filePathExists) {
            this._iconBox.style_class = 'app-menu-icon';

            icon.set_icon_name('start-here');
        } else {
            let gicon = Gio.icon_new_for_string(file.get_path());

            icon.set_gicon(gicon);
        }

        return icon;
    }
}

function init() {
    return new FedoraActivitiesIcon();
}
