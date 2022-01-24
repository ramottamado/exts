/**
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

/* exported init */

'use strict';

const { Gio, GObject, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const DBusSessionManagerIface = '<node>\
  <interface name="org.gnome.SessionManager">\
    <method name="Inhibit">\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="u" direction="out" />\
    </method>\
    <method name="Uninhibit">\
        <arg type="u" direction="in" />\
    </method>\
       <method name="GetInhibitors">\
           <arg type="ao" direction="out" />\
       </method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
        <arg type="o" direction="out" />\
    </signal>\
  </interface>\
</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = '<node>\
  <interface name="org.gnome.SessionManager.Inhibitor">\
    <method name="GetAppId">\
        <arg type="s" direction="out" />\
    </method>\
  </interface>\
</node>';

const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const CaffeineDBusIface =
    '<node>' +
    '   <interface name="dev.ramottamado.Caffeine">' +
    '       <method name="Toggle" />' +
    '   </interface>' +
    '</node>';

const IndicatorName = 'Caffeine';
const IconName = 'preferences-desktop-display-symbolic';

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.SystemIndicator {
        _init() {
            super._init();

            this._state = false;

            this._cookie = '';
            this._inhibitorId = '';

            this._inhibitorIds = [];
            this._cookies = [];
            this._objects = [];

            this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager');

            // ("screen" in global) is false on 3.28, although global.screen exists
            if (typeof global.screen !== 'undefined') {
                this._screen = global.screen;
                this._display = this._screen.get_display();
            } else {
                this._screen = global.display;
                this._display = this._screen;
            }

            this._indicator = this._addIndicator();
            this._indicator.icon_name = IconName;
            this._indicator.visible = false;

            this._item = new PopupMenu.PopupSubMenuMenuItem(_('Keep Screen On'), true);
            this._item.icon.icon_name = IconName;

            this._toggleItem = new PopupMenu.PopupMenuItem('Enable');
            this._toggleItem.connect('activate', this.toggleState.bind(this));
            this._item.menu.addMenuItem(this._toggleItem);

            this.menu.addMenuItem(this._item);

            AggregateMenu._indicators.insert_child_at_index(this, 0);
            AggregateMenu._caffeine = this;

            // Find current index of system menu
            const menuItems = AggregateMenu.menu._getMenuItems();
            const systemMenuIndex = menuItems.indexOf(AggregateMenu._system.menu);
            const menuIndex = systemMenuIndex > -1 ? systemMenuIndex : 12;

            // Place our menu before the system menu
            AggregateMenu.menu.addMenuItem(this.menu, menuIndex - 2);

            this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
            this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));
            this._inFullscreenId = this._screen.connect('in-fullscreen-changed', this.toggleFullscreen.bind(this));

            this.toggleFullscreen();
        }

        get inFullscreen() {
            let nbMonitors = this._screen.get_n_monitors();
            let inFullscreen = false;
            for (let i = 0; i < nbMonitors; i++) {
                if (this._screen.get_monitor_in_fullscreen(i)) {
                    inFullscreen = true;
                    break;
                }
            }
            return inFullscreen;
        }

        toggleFullscreen() {
            Mainloop.timeout_add_seconds(2, () => {
                if (this.inFullscreen && !this._inhibitorIds.includes('fullscreen')) {
                    this.addInhibit('fullscreen');
                }
            });

            if (!this.inFullscreen && this._inhibitorIds.includes('fullscreen')) {
                this.removeInhibit('fullscreen', -1);
            }
        }

        toggleState() {
            if (this._state) {
                this.removeInhibit('user', -1);
            } else {
                this.addInhibit('user');
            }
        }

        addInhibit(inhibitorId) {
            this._sessionManager.InhibitRemote(inhibitorId,
                0, 'Inhibit by %s'.format(IndicatorName), 12,
                cookie => {
                    this._cookie = cookie;
                    this._inhibitorId = inhibitorId;
                }
            );
        }

        removeInhibit(inhibitorId, index) {
            let idx = index === -1 ? this._inhibitorIds.indexOf(inhibitorId) : index;

            if (idx !== -1) {
                try {
                    this._sessionManager.UninhibitRemote(this._cookies[idx]);
                } catch (err) {
                    //
                }
            }
        }

        _inhibitorAdded(proxy, sender, [object]) {
            this._sessionManager.GetInhibitorsRemote(([inhibitors]) => {
                for (let i of inhibitors) {
                    let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                        'org.gnome.SessionManager',
                        i);

                    inhibitor.GetAppIdRemote(inhibitorId => {
                        inhibitorId = String(inhibitorId);

                        if (inhibitorId !== '' && inhibitorId === this._inhibitorId) {
                            this._inhibitorIds.push(this._inhibitorId);
                            this._cookies.push(this._cookie);
                            this._objects.push(object);
                            this._inhibitorId = '';
                            this._cookie = '';

                            if (this._state === false) {
                                this._state = true;
                                this._indicator.visible = true;
                                this._toggleItem.label.text = "Disable";
                            }
                        }
                    });
                }
            });
        }

        _inhibitorRemoved(proxy, sender, [object]) {
            let index = this._objects.indexOf(object);

            if (index !== -1) {
                this._inhibitorIds.splice(index, 1);
                this._cookies.splice(index, 1);
                this._objects.splice(index, 1);

                if (this._inhibitorIds.length === 0) {
                    this._state = false;
                    this._indicator.visible = false;
                    this._toggleItem.label.text = "Enable";
                }
            }
        }

        destroy() {
            // remove all inhibitors
            this._inhibitorIds.forEach((inhibitorId, index) => {
                this.removeInhibit(inhibitorId, index);
            });

            // disconnect from signals
            this._screen.disconnect(this._inFullscreenId);

            if (this._inhibitorAddedId) {
                this._sessionManager.disconnectSignal(this._inhibitorAddedId);
                this._inhibitorAddedId = 0;
            }

            if (this._inhibitorRemovedId) {
                this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
                this._inhibitorRemovedId = 0;
            }

            this._item.destroy();
            this.menu.destroy();

            delete AggregateMenu._caffeine;

            super.destroy();
        }
    });

class Caffeine {
    constructor() {
        this._caffeineIndicator = null;
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(CaffeineDBusIface, this);
    }

    Toggle() {
        if (this._caffeineIndicator) {
            this._caffeineIndicator.toggleState();
        }
    }

    enable() {
        this._caffeineIndicator = new Indicator();
        this._dbusImpl.export(Gio.DBus.session, '/dev/ramottamado/Caffeine');
    }

    disable() {
        this._caffeineIndicator.destroy();
        this._caffeineIndicator = null;
        if (this._dbusImpl) this._dbusImpl.unexport();
    }
}

function init() {
    return new Caffeine();
}