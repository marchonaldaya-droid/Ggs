import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Lock,
  MapPin,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Swords,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { LanAddressInfo, MultiplayerInfo, ServerSummary } from '../types/game';

export type MultiplayerModalTab = 'online' | 'lan' | 'room';

interface MultiplayerModalProps {
  open: boolean;
  initialTab?: MultiplayerModalTab;
  inGame: boolean;
  multiplayer: MultiplayerInfo;
  onClose: () => void;
  onSetName: (name: string) => void;
  onJoinRoom: (roomId: string, opts?: { isLan?: boolean; hostOrigin?: string }) => void;
  onFocusPlayer: (playerId: string) => void;
  onSetServerOrigin: (url: string) => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  open,
  initialTab = 'online',
  inGame,
  multiplayer,
  onClose,
  onSetName,
  onJoinRoom,
  onFocusPlayer,
  onSetServerOrigin,
}) => {
  const [modalTab, setModalTab] = useState<MultiplayerModalTab>(initialTab);
  const [nameInput, setNameInput] = useState(multiplayer.playerName);
  const [roomInput, setRoomInput] = useState(multiplayer.roomId);
  const [serverInput, setServerInput] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);

  // Online Server Browser & Host Form
  const [newServerName, setNewServerName] = useState('');
  const [newServerMode, setNewServerMode] = useState<'conquest' | 'coop'>('conquest');
  const [newServerPublic, setNewServerPublic] = useState(true);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [creatingServer, setCreatingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Hotspot & WiFi LAN State
  const [lanAddresses, setLanAddresses] = useState<LanAddressInfo[]>([]);
  const [lanRooms, setLanRooms] = useState<ServerSummary[]>([]);
  const [lanServerName, setLanServerName] = useState('');
  const [lanMode, setLanMode] = useState<'conquest' | 'coop'>('conquest');
  const [lanHostInput, setLanHostInput] = useState('');
  const [lanRoomJoinInput, setLanRoomJoinInput] = useState('lan-valgard-1');
  const [lanLoading, setLanLoading] = useState(false);
  const [lanError, setLanError] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const apiBase =
    multiplayer.connectedOrigin ||
    multiplayer.sharedOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const normalizeOrigin = (raw: string): string => {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed) return apiBase;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.includes(':')) return `http://${trimmed}`;
    return `http://${trimmed}:3000`;
  };

  const fetchOnlineServers = useCallback(async () => {
    if (!apiBase) return;
    setLoadingServers(true);
    setServerError(null);
    try {
      const res = await fetch(`${apiBase}/api/servers?scope=online`, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; servers?: ServerSummary[] };
      if (data.ok && Array.isArray(data.servers)) {
        setServers(data.servers);
      }
    } catch {
      setServerError('Could not load online server directory.');
    } finally {
      setLoadingServers(false);
    }
  }, [apiBase]);

  const fetchLanDiscovery = useCallback(
    async (customBase?: string) => {
      const targetBase = customBase ? normalizeOrigin(customBase) : apiBase;
      if (!targetBase) return;
      setLanLoading(true);
      setLanError(null);
      try {
        const res = await fetch(`${targetBase}/api/lan/info`, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          ok?: boolean;
          addresses?: LanAddressInfo[];
          lanRooms?: ServerSummary[];
        };
        if (data.ok) {
          setLanAddresses(Array.isArray(data.addresses) ? data.addresses : []);
          setLanRooms(Array.isArray(data.lanRooms) ? data.lanRooms : []);
        }
      } catch {
        setLanError('Unreachable LAN Host — verify Hotspot/Wi-Fi IP and port.');
      } finally {
        setLanLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiBase],
  );

  useEffect(() => {
    if (open) {
      setModalTab(initialTab);
      setNameInput(multiplayer.playerName);
      setRoomInput(multiplayer.roomId);
      setLanHostInput(multiplayer.lanHostUrl || '');
      setServerInput(
        multiplayer.connectedOrigin &&
          typeof window !== 'undefined' &&
          multiplayer.connectedOrigin !== window.location.origin
          ? multiplayer.connectedOrigin
          : '',
      );
      setCopiedIp(null);
      void fetchOnlineServers();
      void fetchLanDiscovery();
    }
  }, [
    open,
    initialTab,
    multiplayer.playerName,
    multiplayer.roomId,
    multiplayer.lanHostUrl,
    multiplayer.connectedOrigin,
    fetchOnlineServers,
    fetchLanDiscovery,
  ]);

  if (!open) return null;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim().length >= 2) {
      onSetName(nameInput.trim());
    }
  };

  const handleJoinPrivateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomInput.trim().length >= 3) {
      onJoinRoom(roomInput.trim(), { isLan: false });
      setModalTab('room');
    }
  };

  const handleCreateOnlineServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiBase || creatingServer) return;
    setCreatingServer(true);
    setServerError(null);
    try {
      const res = await fetch(`${apiBase}/api/servers`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServerName.trim() || `${multiplayer.playerName}'s Realm`,
          mode: newServerMode,
          isPublic: newServerPublic,
          isLan: false,
          hostName: multiplayer.playerName,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; server?: ServerSummary };
      if (data.ok && data.server) {
        setNewServerName('');
        onJoinRoom(data.server.id, { isLan: false });
        setRoomInput(data.server.id);
        setModalTab('room');
        void fetchOnlineServers();
      }
    } catch {
      setServerError('Failed to create online server.');
    } finally {
      setCreatingServer(false);
    }
  };

  const handleCreateLanServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiBase || creatingServer) return;
    setCreatingServer(true);
    setLanError(null);
    try {
      const res = await fetch(`${apiBase}/api/servers`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lanServerName.trim() || `${multiplayer.playerName}'s WiFi Realm`,
          mode: lanMode,
          isPublic: true,
          isLan: true,
          hostName: multiplayer.playerName,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; server?: ServerSummary };
      if (data.ok && data.server) {
        setLanServerName('');
        onJoinRoom(data.server.id, { isLan: true, hostOrigin: apiBase });
        setModalTab('room');
        void fetchLanDiscovery();
      }
    } catch {
      setLanError('Could not launch Hotspot/WiFi LAN server.');
    } finally {
      setCreatingServer(false);
    }
  };

  const handleJoinLanHost = (e: React.FormEvent) => {
    e.preventDefault();
    const targetOrigin = normalizeOrigin(lanHostInput);
    const room = lanRoomJoinInput.trim() || 'lan-valgard-1';
    onJoinRoom(room, { isLan: true, hostOrigin: targetOrigin });
    setModalTab('room');
  };

  const handleCopyHostIp = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIp(url);
      window.setTimeout(() => setCopiedIp(null), 1800);
    } catch {
      // Clipboard blocked in restricted browser
    }
  };

  const totalOnline = 1 + multiplayer.players.length;
  const transportLabel =
    multiplayer.transport === 'ws'
      ? multiplayer.isLanRoom
        ? 'WiFi / Hotspot WS'
        : 'Online WebSocket'
      : multiplayer.transport === 'http'
        ? multiplayer.isLanRoom
          ? 'WiFi / Hotspot Live'
          : 'Online Live'
        : multiplayer.transport === 'lan'
          ? 'Local Tab Sync'
          : 'Not Connected';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/75">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto medieval-panel rounded-xl text-stone-100">
        {/* Heraldic Server Header */}
        <div
          className="relative px-4 pt-4 pb-3.5 rounded-t-xl border-b border-[#d9a441]/25"
          style={{
            background:
              'linear-gradient(135deg, rgba(44,32,16,0.92) 0%, rgba(16,18,24,0.98) 65%)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#d9a441] flex items-center gap-1.5">
                {multiplayer.isLanRoom ? (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Hotspot & WiFi LAN · Multi-Device Sync</span>
                  </>
                ) : multiplayer.serverMode === 'conquest' ? (
                  <>
                    <Swords className="w-3.5 h-3.5" />
                    <span>Online Conquest · Real-Time Server</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Online Co-op · Shared Realm Server</span>
                  </>
                )}
              </div>
              <h2 className="font-display text-lg font-bold text-white truncate mt-0.5">
                {inGame
                  ? multiplayer.serverName || multiplayer.roomId
                  : 'Realm Server Browser'}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-[11px]">
                <span className="font-mono-num font-bold text-white">
                  {inGame ? `${totalOnline} Online` : `${servers.length} Online · ${lanRooms.length} LAN`}
                </span>
                <span
                  className={
                    multiplayer.connected
                      ? 'text-emerald-300 font-semibold'
                      : 'text-[#f2ce7d] font-semibold'
                  }
                >
                  {multiplayer.connected
                    ? transportLabel
                    : multiplayer.reconnecting
                      ? 'Connecting...'
                      : 'Ready to Join'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Server Browser"
              className="w-11 h-11 rounded-lg obsidian-btn flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* 3-Tab Switcher: Online Servers / Hotspot & WiFi / Active Server */}
          <div className="grid grid-cols-3 gap-1 bg-[#090a0e] border border-[#d9a441]/20 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setModalTab('online');
                void fetchOnlineServers();
              }}
              className={`min-h-[44px] rounded-md text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap ${
                modalTab === 'online'
                  ? 'bg-[#d9a441]/22 text-[#f2ce7d] border border-[#d9a441]/55'
                  : 'text-stone-400 border border-transparent'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Online</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModalTab('lan');
                void fetchLanDiscovery();
              }}
              className={`min-h-[44px] rounded-md text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap ${
                modalTab === 'lan'
                  ? 'bg-[#d9a441]/22 text-[#f2ce7d] border border-[#d9a441]/55'
                  : 'text-stone-400 border border-transparent'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 shrink-0" />
              <span>Hotspot/WiFi</span>
            </button>
            <button
              type="button"
              onClick={() => setModalTab('room')}
              className={`min-h-[44px] rounded-md text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap ${
                modalTab === 'room'
                  ? 'bg-[#d9a441]/22 text-[#f2ce7d] border border-[#d9a441]/55'
                  : 'text-stone-400 border border-transparent'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>This Server</span>
            </button>
          </div>

          {modalTab === 'online' && (
            <div className="space-y-4">
              <form
                onSubmit={handleCreateOnlineServer}
                className="rounded-lg medieval-card p-3.5 space-y-3"
              >
                <div className="text-xs font-bold text-[#f2ce7d] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#d9a441]" />
                  <span>Host Online Server</span>
                </div>

                <input
                  type="text"
                  maxLength={32}
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder={`${multiplayer.playerName}'s Conquest Realm`}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs text-white outline-none focus:border-[#d9a441]"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewServerMode('conquest')}
                    className={`min-h-[44px] px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      newServerMode === 'conquest'
                        ? 'bg-rose-950/75 border-rose-400 text-rose-100'
                        : 'obsidian-btn text-stone-300'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Conquest PvP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewServerMode('coop')}
                    className={`min-h-[44px] px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      newServerMode === 'coop'
                        ? 'bg-emerald-950/75 border-emerald-400 text-emerald-100'
                        : 'obsidian-btn text-stone-300'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Co-op Build</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewServerPublic(true)}
                      className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
                        newServerPublic
                          ? 'bg-sky-950/70 border-sky-400 text-sky-200'
                          : 'obsidian-btn text-stone-400'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Public</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewServerPublic(false)}
                      className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
                        !newServerPublic
                          ? 'bg-[#d9a441]/20 border-[#d9a441] text-[#f2ce7d]'
                          : 'obsidian-btn text-stone-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Private</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingServer}
                    className="min-h-[44px] px-4 rounded-lg brass-btn font-display text-xs font-bold whitespace-nowrap disabled:opacity-60"
                  >
                    {creatingServer ? 'Launching...' : 'Host & Join'}
                  </button>
                </div>
              </form>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-[#d9a441]" />
                    <span>Online Servers ({servers.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void fetchOnlineServers()}
                    className="min-h-[40px] px-3 rounded-lg obsidian-btn text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingServers ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {serverError && <div className="text-[11px] text-[#f2ce7d] mb-2">{serverError}</div>}

                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                  {servers.length === 0 ? (
                    <div className="text-xs text-stone-400 text-center py-4 medieval-card rounded-lg">
                      No public online servers found — host one above.
                    </div>
                  ) : (
                    servers.map((srv) => {
                      const isCurrent = inGame && srv.id === multiplayer.roomId && !multiplayer.isLanRoom;
                      return (
                        <div
                          key={srv.id}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg medieval-card"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{srv.name}</div>
                            <div className="font-mono-num text-[10px] text-stone-400 truncate">
                              {srv.mode === 'conquest' ? 'Conquest' : 'Co-op'} · Host {srv.hostName} ·{' '}
                              {srv.playerCount} Online
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isCurrent}
                            onClick={() => {
                              onJoinRoom(srv.id, { isLan: false });
                              onClose();
                            }}
                            className={`min-h-[44px] px-3.5 rounded-lg text-xs font-bold shrink-0 whitespace-nowrap ${
                              isCurrent
                                ? 'bg-emerald-950/60 border border-emerald-400/50 text-emerald-200'
                                : 'brass-btn'
                            }`}
                          >
                            {isCurrent ? 'Joined' : 'Join Server'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <form onSubmit={handleJoinPrivateSubmit} className="pt-2 border-t border-white/10">
                <label
                  htmlFor="coop-room-code"
                  className="block text-[11px] font-semibold text-stone-300 mb-1.5"
                >
                  Join Server by Room Code
                </label>
                <div className="flex gap-2">
                  <input
                    id="coop-room-code"
                    type="text"
                    maxLength={28}
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder="oakvale-realm"
                    className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs font-mono-num text-white outline-none focus:border-[#d9a441]"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-lg obsidian-btn text-xs font-bold text-emerald-200 whitespace-nowrap"
                  >
                    Join
                  </button>
                </div>
              </form>

              <div>
                <button
                  type="button"
                  onClick={() => setShowServerConfig((v) => !v)}
                  className="text-[11px] font-semibold text-stone-400 underline underline-offset-2"
                >
                  {showServerConfig ? 'Hide Custom Server Address' : 'Connect Custom Server Address'}
                </button>
                {showServerConfig && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSetServerOrigin(serverInput);
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      type="url"
                      value={serverInput}
                      onChange={(e) => setServerInput(e.target.value)}
                      placeholder="https://your-realm-server.example"
                      className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs font-mono-num text-white outline-none focus:border-[#d9a441]"
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-3.5 rounded-lg obsidian-btn text-xs font-bold whitespace-nowrap"
                    >
                      Connect
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {modalTab === 'lan' && (
            <div className="space-y-4">
              {/* Detected Hotspot & WiFi Local Addresses */}
              <div className="rounded-lg medieval-card p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[#f2ce7d] flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-[#d9a441]" />
                    <span>Hotspot & Wi-Fi Host Addresses</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchLanDiscovery()}
                    className="min-h-[38px] px-2.5 rounded-lg obsidian-btn text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${lanLoading ? 'animate-spin' : ''}`} />
                    <span>Scan</span>
                  </button>
                </div>
                <p className="text-[11px] text-stone-400 leading-snug">
                  Turn on Mobile Hotspot or connect devices to the same Wi-Fi, then enter one of the
                  Host IP addresses below on the second device.
                </p>
                {lanAddresses.length === 0 ? (
                  <div className="text-[11px] text-stone-400 py-2">
                    No LAN Wi-Fi/Hotspot interface detected yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {lanAddresses.map((addr) => (
                      <div
                        key={addr.url}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#090a0e] border border-white/10"
                      >
                        <div className="min-w-0">
                          <div className="font-mono-num text-xs font-bold text-white truncate">
                            {addr.url}
                          </div>
                          <div className="text-[10px] text-stone-400 truncate">
                            {addr.kind === 'hotspot' ? 'Mobile Hotspot' : 'Wi-Fi / LAN'} · {addr.label}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyHostIp(addr.url)}
                          className="min-h-[40px] px-3 rounded-lg obsidian-btn text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
                        >
                          {copiedIp === addr.url ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#d9a441]" />
                              <span>Copy IP</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Host a LAN Server */}
              <form
                onSubmit={handleCreateLanServer}
                className="rounded-lg medieval-card p-3.5 space-y-2.5"
              >
                <div className="text-xs font-bold text-[#f2ce7d] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#d9a441]" />
                  <span>Host LAN Game (Hotspot / Wi-Fi)</span>
                </div>
                <input
                  type="text"
                  maxLength={32}
                  value={lanServerName}
                  onChange={(e) => setLanServerName(e.target.value)}
                  placeholder={`${multiplayer.playerName}'s WiFi Skirmish`}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs text-white outline-none focus:border-[#d9a441]"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLanMode('conquest')}
                      className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                        lanMode === 'conquest'
                          ? 'bg-rose-950/75 border-rose-400 text-rose-100'
                          : 'obsidian-btn text-stone-300'
                      }`}
                    >
                      Conquest
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanMode('coop')}
                      className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                        lanMode === 'coop'
                          ? 'bg-emerald-950/75 border-emerald-400 text-emerald-100'
                          : 'obsidian-btn text-stone-300'
                      }`}
                    >
                      Co-op
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingServer}
                    className="min-h-[44px] px-4 rounded-lg brass-btn font-display text-xs font-bold whitespace-nowrap"
                  >
                    Host LAN
                  </button>
                </div>
              </form>

              {/* Join Host on WiFi / Hotspot by IP */}
              <form
                onSubmit={handleJoinLanHost}
                className="rounded-lg medieval-card p-3.5 space-y-2.5"
              >
                <div className="text-xs font-bold text-stone-200">
                  Connect to Friend&apos;s Hotspot / Wi-Fi IP
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={lanHostInput}
                    onChange={(e) => setLanHostInput(e.target.value)}
                    placeholder="192.168.43.1:3000 (optional)"
                    className="min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs font-mono-num text-white outline-none focus:border-[#d9a441]"
                  />
                  <input
                    type="text"
                    value={lanRoomJoinInput}
                    onChange={(e) => setLanRoomJoinInput(e.target.value)}
                    placeholder="lan-valgard-1"
                    className="min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs font-mono-num text-white outline-none focus:border-[#d9a441]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchLanDiscovery(lanHostInput)}
                    className="min-h-[44px] px-3.5 rounded-lg obsidian-btn text-xs font-semibold whitespace-nowrap"
                  >
                    Find Rooms
                  </button>
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] px-4 rounded-lg brass-btn font-display text-xs font-bold whitespace-nowrap"
                  >
                    Connect LAN
                  </button>
                </div>
                {lanError && <div className="text-[11px] text-[#f2ce7d]">{lanError}</div>}
              </form>

              {lanRooms.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-stone-200">
                    Active Hotspot / Wi-Fi Rooms ({lanRooms.length})
                  </div>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {lanRooms.map((srv) => (
                      <div
                        key={srv.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg medieval-card"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{srv.name}</div>
                          <div className="font-mono-num text-[10px] text-stone-400 truncate">
                            {srv.id} · {srv.playerCount} Online
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onJoinRoom(srv.id, {
                              isLan: true,
                              hostOrigin: lanHostInput ? normalizeOrigin(lanHostInput) : apiBase,
                            });
                            onClose();
                          }}
                          className="min-h-[44px] px-3.5 rounded-lg brass-btn text-xs font-bold shrink-0 whitespace-nowrap"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {modalTab === 'room' && (
            <div className="space-y-4">
              <div className="rounded-lg medieval-card px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                    Server Room Code
                  </div>
                  <div className="font-mono-num text-sm font-bold text-[#f2ce7d] truncate">
                    {multiplayer.roomId}
                  </div>
                </div>
                <span className="font-mono-num text-xs text-stone-300 whitespace-nowrap">
                  {multiplayer.serverMode === 'coop' ? 'Co-op' : 'Conquest'}
                </span>
              </div>

              <form onSubmit={handleSaveName}>
                <label
                  htmlFor="coop-player-name"
                  className="block text-xs font-semibold text-stone-200 mb-1.5"
                >
                  Your Lord Name
                </label>
                <div className="flex gap-2">
                  <input
                    id="coop-player-name"
                    type="text"
                    maxLength={18}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Valgard"
                    className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-white/15 text-xs text-white outline-none focus:border-[#d9a441]"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-lg obsidian-btn text-xs font-bold whitespace-nowrap"
                  >
                    Save
                  </button>
                </div>
              </form>

              <div>
                <div className="text-xs font-semibold text-stone-200 mb-2">
                  Lords in This Server ({inGame ? totalOnline : multiplayer.players.length})
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg medieval-card">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 border border-white/30"
                        style={{ backgroundColor: multiplayer.playerColor }}
                      />
                      <span className="text-xs font-bold text-white truncate">
                        {multiplayer.playerName}
                      </span>
                      <span className="text-[11px] text-[#f2ce7d]">(You)</span>
                    </div>
                  </div>

                  {multiplayer.players.length === 0 ? (
                    <div className="text-[11px] text-stone-400 medieval-card rounded-lg px-3 py-3 text-center">
                      No other Lords connected yet. Share the Room Code above or host a Public Server.
                    </div>
                  ) : (
                    multiplayer.players.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg medieval-card"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-sm shrink-0 border border-white/30"
                            style={{ backgroundColor: p.color }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{p.name}</div>
                            <div className="text-[10px] text-stone-400">
                              {p.isGlobeView ? 'Viewing Earth Globe' : 'Active on map'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onFocusPlayer(p.id);
                            onClose();
                          }}
                          className="min-h-[44px] px-3 rounded-lg bg-sky-950/70 border border-sky-400/50 text-xs font-semibold text-sky-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

