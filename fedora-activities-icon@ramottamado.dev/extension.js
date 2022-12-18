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
 */

/* exported init */

'use strict';

const Gio = imports.gi.Gio;

class FedoraActivitiesIcon {
    constructor() { }

    enable() {
        let file = Gio.File.new_for_uri("file:///usr/share/icons/hicolor/scalable/apps/start-here.svg");

        let filePathExists = file.query_exists(null);

        if (!filePathExists) {
            throw new Error("Extension not supported!");
        }
    }

    disable() { }
}

function init() {
    return new FedoraActivitiesIcon();
}
