/* Game Arena Nexus Multiplayer SDK — browser-only, no dependencies. */
(() => {
  'use strict';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ROOM_RE = /^[A-Za-z0-9_-]{4,24}$/;
  const GAME_RE = /^[A-Za-z0-9_-]{2,80}$/;

  function makeRoomCode(length = 6) {
    const bytes = new Uint8Array(length);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, value => ALPHABET[value % ALPHABET.length]).join('');
  }
  function cleanName(value) {
    return String(value || 'Player').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Player';
  }
  function resolveApiBase(value) {
    const meta = document.querySelector('meta[name="nexus-api-base"]')?.content;
    const configured = value || window.NEXUS_API_BASE || meta || location.origin;
    const url = new URL(configured, location.href);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('API server must use HTTPS outside local development.');
    }
    return url.origin;
  }

  class Client {
    constructor(options = {}) {
      this.serverUrl = resolveApiBase(options.serverUrl);
      this.gameId = String(options.gameId || '').trim();
      if (!GAME_RE.test(this.gameId)) throw new Error('gameId must use 2–80 letters, numbers, _ or -.');
      this.maxPlayers = Number(options.maxPlayers ?? 2);
      if (!Number.isInteger(this.maxPlayers) || this.maxPlayers < 2 || this.maxPlayers > 4) throw new Error('maxPlayers must be 2, 3, or 4.');
      this.playerName = cleanName(options.playerName || 'Player');
      this.socket = null;
      this.roomId = '';
      this.seat = 0;
      this.host = false;
      this.players = [];
      this.connected = false;
      this.listeners = new Map();
      this._heartbeat = null;
      this._connectPromise = null;
    }

    on(eventName, callback) {
      if (typeof callback !== 'function') throw new TypeError('callback must be a function');
      const key = String(eventName);
      const group = this.listeners.get(key) || new Set();
      group.add(callback);
      this.listeners.set(key, group);
      return () => group.delete(callback);
    }

    off(eventName, callback) { this.listeners.get(String(eventName))?.delete(callback); }

    _emit(eventName, payload) {
      for (const callback of [...(this.listeners.get(String(eventName)) || [])]) {
        try { callback(payload); } catch (error) { setTimeout(() => { throw error; }, 0); }
      }
    }

    createRoom(options = {}) {
      const roomId = String(options.roomId || makeRoomCode()).toUpperCase();
      return this._connect('create', roomId);
    }

    joinRoom(options = {}) {
      const roomId = String(options.roomId || new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
      if (!ROOM_RE.test(roomId)) return Promise.reject(new Error('کد اتاق باید ۴ تا ۲۴ نویسه باشد.'));
      return this._connect('join', roomId);
    }

    _connect(intent, roomId) {
      if (!ROOM_RE.test(roomId)) return Promise.reject(new Error('کد اتاق نامعتبر است.'));
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        return Promise.reject(new Error('ابتدا از اتاق فعلی خارج شو.'));
      }
      this.roomId = roomId;
      this.players = [];
      const base = new URL(this.serverUrl);
      const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      const query = new URLSearchParams({
        mode: 'game', intent, gameId: this.gameId, maxPlayers: String(this.maxPlayers), name: this.playerName
      });
      const wsUrl = `${protocol}//${base.host}/api/room/${encodeURIComponent(roomId)}/ws?${query}`;
      let socket;
      try { socket = new WebSocket(wsUrl); }
      catch { return Promise.reject(new Error('مرورگر نتوانست WebSocket را ایجاد کند.')); }
      this.socket = socket;
      this.connected = false;
      this._emit('connecting', { intent, roomId });

      this._connectPromise = new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { socket.close(); } catch {}
          reject(new Error('اتصال اتاق کامل نشد؛ آدرس Worker، شناسه بازی و Deploy را بررسی کن.'));
        }, 10000);
        const finishReject = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        };
        socket.addEventListener('message', event => {
          let packet;
          try { packet = JSON.parse(event.data); } catch { return; }
          if (packet.type === 'welcome') {
            if (packet.mode !== 'game' || packet.gameId !== this.gameId || packet.maxPlayers !== this.maxPlayers) {
              finishReject(new Error('پاسخ سرور با تنظیمات این بازی مطابقت ندارد.'));
              try { socket.close(); } catch {}
              return;
            }
            if (!settled) { settled = true; clearTimeout(timeout); resolve(packet); }
            this.connected = true;
            this.seat = Number(packet.seat) || 0;
            this.host = !!packet.host;
            this.players = Array.isArray(packet.players) ? packet.players : [];
            this._startHeartbeat();
            this._emit('welcome', packet);
            this._emit('players', this.players);
            return;
          }
          if (packet.type === 'game_roster') {
            this.players = Array.isArray(packet.players) ? packet.players : [];
            this._emit('players', this.players);
            this._emit('roster', packet);
            return;
          }
          if (packet.type === 'game_message') {
            const message = { event: packet.event, payload: packet.payload, fromSeat: packet.fromSeat, fromName: packet.fromName, at: packet.at };
            this._emit('message', message);
            this._emit(`message:${packet.event}`, message);
            return;
          }
          if (packet.type === 'error') this._emit('server-error', packet);
          if (packet.type === 'pong') this._emit('pong', packet);
        });
        socket.addEventListener('error', () => {
          finishReject(new Error('اتصال WebSocket ناموفق شد؛ مطمئن شو Worker جدید Deploy شده است و از HTTPS استفاده می‌کنی.'));
          this._emit('error', new Error('WebSocket connection failed'));
        });
        socket.addEventListener('close', event => {
          clearTimeout(timeout);
          this._stopHeartbeat();
          const wasConnected = this.connected;
          this.connected = false;
          this.host = false;
          this.seat = 0;
          if (!settled) finishReject(new Error(`اتصال اتاق رد شد (کد ${event.code}). شاید کد اشتباه، اتاق پر یا Worker قدیمی باشد.`));
          if (wasConnected) this._emit('disconnect', { code: event.code, reason: event.reason, roomId: this.roomId });
          this._emit('close', { code: event.code, reason: event.reason, roomId: this.roomId });
        });
      });
      return this._connectPromise;
    }

    send(event, payload = null, options = {}) {
      if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
      const name = String(event || '');
      if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,47}$/.test(name)) throw new Error('Invalid event name.');
      const packet = { type: 'game_message', event: name, payload };
      if (Number.isInteger(options.toSeat)) packet.toSeat = options.toSeat;
      const serialized = JSON.stringify(packet);
      if (serialized.length > 10000) throw new Error('Game message is too large (max 10 KB).');
      try { this.socket.send(serialized); return true; } catch { return false; }
    }

    inviteUrl() {
      if (!this.roomId) return location.href;
      const url = new URL(location.href);
      url.searchParams.set('room', this.roomId);
      return url.href;
    }

    leave() {
      this._stopHeartbeat();
      this.connected = false;
      const socket = this.socket;
      this.socket = null;
      if (socket && socket.readyState < WebSocket.CLOSING) {
        try { socket.close(1000, 'player left'); } catch {}
      }
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeat = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          try { this.socket.send(JSON.stringify({ type: 'ping' })); } catch {}
        }
      }, 20000);
    }
    _stopHeartbeat() { if (this._heartbeat) clearInterval(this._heartbeat); this._heartbeat = null; }
  }

  window.NexusMultiplayer = Object.freeze({ Client, makeRoomCode, resolveApiBase, version: '1.0.0' });
})();
