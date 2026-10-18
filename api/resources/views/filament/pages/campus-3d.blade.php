<x-filament-panels::page>
    <div wire:ignore class="space-y-3">
        <div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:center">
            <strong id="c3d-alert">Loading…</strong>
            <label>Floors
                <select id="c3d-peel" style="margin-left:.25rem;border-radius:.4rem;padding:.2rem .4rem;color:inherit;background:transparent">
                    <option value="">All floors</option>
                </select>
            </label>
            <label>Explode floors
                <input id="c3d-explode" type="range" min="0" max="4" step="0.5" value="0" style="vertical-align:middle;margin-left:.25rem">
            </label>
            <label>Replay
                <select id="c3d-replay" style="margin-left:.25rem;border-radius:.4rem;padding:.2rem .4rem;color:inherit;background:transparent">
                    <option value="">Live (now)</option>
                    @foreach ($this->replayOptions() as $id => $label)
                        <option value="{{ $id }}">{{ $label }}</option>
                    @endforeach
                </select>
            </label>
            <span id="c3d-replay-controls" style="display:none;align-items:center;gap:.5rem">
                <x-filament::button size="sm" id="c3d-play" color="gray">Play</x-filament::button>
                <input id="c3d-time" type="range" min="0" max="60" value="0" step="1" aria-label="Time after the alert" style="width:14rem">
                <span id="c3d-clock" style="font-variant-numeric:tabular-nums">0:00</span>
            </span>
        </div>

        <div id="campus3d" style="height:68vh;min-height:360px;border-radius:.75rem;overflow:hidden;background:#f4f7f5;color:#333;display:flex;align-items:center;justify-content:center">Loading 3D view…</div>

        <div style="display:flex;flex-wrap:wrap;gap:1rem;font-size:.85rem">
            <span><span style="color:#c0392b">▬ ▬</span> Blocked path</span>
            <span><span style="color:#e67e22">▬▬</span> Congested path</span>
            <span><span style="color:#e74c3c">■</span> Hazard reported</span>
            <span><span style="color:#ffc56b">■</span><span style="color:#e8452c">■</span> People still inside (last known room; light = few, dark = 10+)</span>
            <span><span style="color:#d0021b">▼</span> Open SOS</span>
            <span><span style="color:#1a7a3c">▼</span> Checked in safe</span>
        </div>
        <p id="c3d-info" style="font-size:.9rem" aria-live="polite">Drag to rotate, scroll or pinch to zoom. Click a room or pin for details.</p>
    </div>

    <script src="{{ asset('js/campus-3d.js') }}"></script>
    <script>
        (() => {
            const $ = (id) => document.getElementById(id);
            const el = $('campus3d');
            const urls = { snapshot: @js(route('campus3d.snapshot')), live: @js(route('campus3d.live')), replay: @js(route('campus3d.replay')) };
            const get = (url) => fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then((r) => {
                if (!r.ok) throw new Error(r.status);
                return r.json();
            });
            if (!window.EvacuCampus3D || !EvacuCampus3D.webglAvailable()) {
                el.textContent = 'This browser cannot show 3D (WebGL is turned off). Use the Safety Monitor instead.';
                return;
            }

            let viewer = null;
            let replay = null;
            let playing = null;
            const describe = (d) => d.pinId ? d.label
                : `${d.name}${d.hazard ? ' · hazard reported' : ''}${d.count ? ` · ${d.count} ${d.count === 1 ? 'person' : 'people'} last seen here` : ''}`;
            const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

            async function poll() {
                if (replay || !viewer) return;
                try {
                    const live = await get(urls.live);
                    viewer.update(live);
                    $('c3d-alert').textContent = live.alert ? `${live.alert.label}${live.alert.active ? ' (active)' : ''}` : 'No active alert';
                } catch { $('c3d-alert').textContent = 'Connection lost, retrying…'; }
            }

            // Replay: each person's last known room up to time t, minus people who had checked in safe by then.
            function showReplayAt(t) {
                const last = new Map();
                for (const e of replay.events) { if (e.t > t) break; last.set(e.p, e.room); }
                const done = replay.checkins.filter((c) => c.t <= t);
                const safe = new Set(done.map((c) => c.p));
                const roomCounts = {};
                for (const [p, room] of last) if (room && !safe.has(p)) roomCounts[room] = (roomCounts[room] || 0) + 1;
                const perNode = {};
                for (const c of done) if (c.node) perNode[c.node] = (perNode[c.node] || 0) + 1;
                const pins = Object.entries(perNode).map(([nodeId, n]) => ({ id: `c-${nodeId}`, nodeId, kind: 'checkin', label: `${n} checked in safe` }));
                viewer.update({ roomCounts, pins, edges: {} });
                $('c3d-clock').textContent = `${clock(t)} · ${safe.size} safe`;
            }

            function stop() { clearInterval(playing); playing = null; $('c3d-play').textContent = 'Play'; }

            $('c3d-replay').addEventListener('change', async (ev) => {
                stop();
                replay = null;
                $('c3d-replay-controls').style.display = ev.target.value ? 'inline-flex' : 'none';
                if (!ev.target.value) return poll();
                replay = await get(`${urls.replay}?alert=${encodeURIComponent(ev.target.value)}`);
                $('c3d-alert').textContent = `Replay: ${replay.alert.label}`;
                $('c3d-time').max = replay.duration;
                $('c3d-time').value = 0;
                showReplayAt(0);
            });
            $('c3d-time').addEventListener('input', (ev) => replay && showReplayAt(Number(ev.target.value)));
            $('c3d-play').addEventListener('click', () => {
                if (!replay) return;
                if (playing) return stop();
                $('c3d-play').textContent = 'Pause';
                const slider = $('c3d-time');
                if (Number(slider.value) >= replay.duration) slider.value = 0;
                const step = Math.max(1, replay.duration / 150); // a whole drill plays in about 30 s
                playing = setInterval(() => {
                    slider.value = Math.min(replay.duration, Number(slider.value) + step);
                    showReplayAt(Number(slider.value));
                    if (Number(slider.value) >= replay.duration) stop();
                }, 200);
            });

            get(urls.snapshot).then((snap) => {
                el.textContent = '';
                viewer = EvacuCampus3D.mount(el, snap, { onPick: (d) => { $('c3d-info').textContent = describe(d); } });
                const floors = new Map();
                snap.buildings.forEach((b) => b.floors.forEach((f) => floors.has(f.level) || floors.set(f.level, f.name)));
                [...floors].sort((a, b) => a[0] - b[0]).forEach(([level, name]) => $('c3d-peel').add(new Option(`Up to ${name}`, level)));
                $('c3d-peel').addEventListener('change', (ev) => viewer.peel(ev.target.value === '' ? null : Number(ev.target.value)));
                $('c3d-explode').addEventListener('input', (ev) => viewer.explode(Number(ev.target.value)));
                window.campus3d = viewer; // for debugging and browser tests
                poll();
                setInterval(poll, 2000);
            }).catch(() => { el.textContent = 'Could not load the campus map.'; });
        })();
    </script>
</x-filament-panels::page>
