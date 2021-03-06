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

const { ThumbnailsBox } = imports.ui.workspaceThumbnail;

class HideWorkspaceSwitcher {
    constructor() {
        let ThumbnailsBoxProto = ThumbnailsBox.prototype;

        this._originalUpdateShouldShow = ThumbnailsBoxProto._updateShouldShow;
    }

    enable() {
        ThumbnailsBox.prototype._updateShouldShow = function () {
            const shouldShow = false;

            if (this._shouldShow === shouldShow)
                return;

            this._shouldShow = shouldShow;
            this.notify('should-show');
        }
    }

    disable() {
        ThumbnailsBox.prototype._updateShouldShow = this._originalUpdateShouldShow;

        this._originalUpdateShouldShow = null;
    }
}

function init() {
    return new HideWorkspaceSwitcher();
}
