// Estilos globales del proyecto.
// Refactor: extraídos de page.tsx (eran ~2260 líneas de CSS embebido).
// Para usar este componente, simplemente incluirlo una vez en el árbol JSX:
//   <EstilosGlobales />

const ESTILOS_GLOBALES = String.raw`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-0: #030305;
          --bg-1: #07070d;
          --bg-2: #0a0a14;
          --bg-3: #0f0f1c;
          --surface: rgba(255,255,255,0.03);
          --surface-2: rgba(255,255,255,0.05);
          --primary: #c41e3a;
          --primary-2: #ff3859;
          --accent: #d4af5f;
          --accent-2: #ffd47a;
          --white: #fafafa;
          --gray-300: #a0a0b0;
          --gray-500: #6b6b85;
          --gray-700: #3a3a4a;
          --border: rgba(255,255,255,0.06);
          --border-2: rgba(255,255,255,0.1);
          --success: #10b981;
          --danger: #ef4444;
          --warning: #f59e0b;
          --info: #3b82f6;
          --whatsapp: #25d366;
        }

        html, body { background: var(--bg-0); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 32px 24px;
          position: relative;
          overflow-x: hidden;
        }

        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 70%, rgba(212,175,95,0.08) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.05) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
          animation: meshMove 20s ease-in-out infinite;
        }

        @keyframes meshMove {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(2deg); }
        }

        .page::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 64px 64px;
          pointer-events: none;
          z-index: 0;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }

        .content {
          position: relative;
          z-index: 1;
          max-width: 1320px;
          margin: 0 auto;
        }

        .search-container {
          min-height: 88vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 56px 48px;
          max-width: 480px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 120px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        .search-card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 80%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0.6;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .logo-orb {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(196,30,58,0.5), rgba(196,30,58,0.05));
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 32px;
          position: relative;
          box-shadow: 0 0 80px rgba(196,30,58,0.3), inset 0 0 24px rgba(196,30,58,0.15);
        }

        .logo-orb::after {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.15);
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        .logo-orb span { font-size: 40px; }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 34px;
          letter-spacing: -0.8px;
          margin-bottom: 10px;
        }

        .brand span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .tagline {
          font-size: 14px;
          color: var(--gray-500);
          margin-bottom: 44px;
          letter-spacing: 0.5px;
          font-weight: 500;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          text-align: left;
        }

        .input-label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
        }

        .search-input {
          width: 100%;
          padding: 20px 24px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          color: var(--white);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: all 0.3s;
        }

        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(196,30,58,0.12);
          background: var(--bg-2);
        }

        .btn-primary {
          width: 100%;
          padding: 20px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 32px rgba(196,30,58,0.4), 0 1px 0 rgba(255,255,255,0.15) inset;
          letter-spacing: 0.3px;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(196,30,58,0.5), 0 1px 0 rgba(255,255,255,0.2) inset;
        }

        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .error-msg {
          color: var(--danger);
          font-size: 13px;
          margin-top: -16px;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px;
        }

        .admin-link {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          font-size: 12px;
          color: var(--gray-500);
        }

        .admin-link button {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
          font-family: inherit;
        }

        .admin-link button:hover { color: var(--accent-2); }

        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding: 24px 28px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          flex-wrap: wrap;
          gap: 16px;
        }

        .dash-greeting h1 {
          font-family: 'Syne', sans-serif;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }

        .dash-greeting h1 span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .dash-greeting p {
          color: var(--gray-500);
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .admin-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-actions { display: flex; gap: 10px; align-items: center; }

        .btn-back, .btn-secondary {
          padding: 12px 22px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-back:hover { background: var(--surface-2); border-color: var(--primary); }
        .btn-secondary:hover { background: var(--surface-2); border-color: var(--accent); }

        .stats-row {
          display: flex;
          gap: 14px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        .stat-pill {
          flex: 1;
          min-width: 180px;
          padding: 18px 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.3s;
        }

        .stat-pill:hover { border-color: var(--border-2); transform: translateY(-2px); }

        .stat-pill-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }

        .stat-pill.clients .stat-pill-icon {
          background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.05) 100%);
          border: 1px solid rgba(59,130,246,0.2);
        }
        .stat-pill.total .stat-pill-icon {
          background: linear-gradient(135deg, rgba(212,175,95,0.2) 0%, rgba(212,175,95,0.05) 100%);
          border: 1px solid rgba(212,175,95,0.2);
        }
        .stat-pill.active .stat-pill-icon {
          background: linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }
        .stat-pill.paused .stat-pill-icon {
          background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .stat-pill.banned .stat-pill-icon {
          background: linear-gradient(135deg, rgba(220,38,38,0.25) 0%, rgba(220,38,38,0.08) 100%);
          border: 1px solid rgba(220,38,38,0.35);
        }
        .stat-pill.banned.alert {
          border-color: rgba(220,38,38,0.5);
          background: linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.02) 100%);
          animation: pulseBan 2.5s ease-in-out infinite;
        }
        @keyframes pulseBan {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
        }

        .stat-pill-info { flex: 1; min-width: 0; }
        .stat-pill-label {
          font-size: 11px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .stat-pill-value {
          font-family: 'Syne', sans-serif;
          font-size: 28px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.5px;
        }
        .stat-pill.clients .stat-pill-value { color: var(--info); }
        .stat-pill.total .stat-pill-value { color: var(--accent); }
        .stat-pill.active .stat-pill-value { color: var(--success); }
        .stat-pill.paused .stat-pill-value { color: var(--danger); }
        .stat-pill.banned .stat-pill-value { color: #dc2626; }

        /* ============================================
         * PANTALLA "CUENTA BLOQUEADA" — vista cliente cuando banned=true
         * ============================================ */
        .banned-screen {
          min-height: calc(100vh - 60px);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        .banned-card {
          max-width: 540px;
          width: 100%;
          background: linear-gradient(180deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.03) 100%);
          border: 2px solid rgba(220,38,38,0.35);
          border-radius: 24px;
          padding: 48px 36px;
          text-align: center;
          box-shadow: 0 25px 80px rgba(220,38,38,0.15);
          animation: bannedAppear 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes bannedAppear {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .banned-icon {
          font-size: 86px;
          margin-bottom: 8px;
          animation: bannedPulse 1.5s ease-in-out infinite;
        }

        @keyframes bannedPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        .banned-title {
          font-family: 'Syne', sans-serif;
          font-size: 38px;
          font-weight: 800;
          color: #dc2626;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          text-shadow: 0 2px 20px rgba(220,38,38,0.3);
        }

        .banned-subtitle {
          font-size: 18px;
          color: var(--white);
          margin: 0 0 24px 0;
          font-weight: 500;
        }

        .banned-info {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 20px;
          margin: 20px 0 28px;
          text-align: left;
        }

        .banned-info p {
          color: var(--gray-400);
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }

        .banned-info p + p {
          margin-top: 12px;
        }

        .banned-date {
          color: var(--gray-500) !important;
          font-size: 12px !important;
          font-family: 'JetBrains Mono', monospace;
          padding-top: 12px;
          border-top: 1px dashed rgba(255,255,255,0.1);
        }

        .banned-whatsapp {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          color: white;
          text-decoration: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 14px;
          transition: all 0.2s;
          box-shadow: 0 8px 24px rgba(37,211,102,0.3);
        }

        .banned-whatsapp:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(37,211,102,0.4);
        }

        .banned-back {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--gray-400);
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          width: 100%;
          transition: all 0.2s;
        }

        .banned-back:hover {
          background: rgba(255,255,255,0.05);
          color: var(--white);
          border-color: rgba(255,255,255,0.25);
        }

        @media (max-width: 640px) {
          .banned-card { padding: 36px 22px; }
          .banned-title { font-size: 28px; }
          .banned-subtitle { font-size: 15px; }
          .banned-icon { font-size: 64px; }
        }

        /* ============================================================
         * MONITOR DE CHROMES (heartbeats)
         * ============================================================ */
        .chrome-monitor {
          margin: 28px 0 24px;
          padding: 20px 22px;
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid var(--border-2);
          border-radius: 18px;
        }
        .chrome-monitor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chrome-monitor-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: var(--white);
          margin: 0;
        }
        .chrome-monitor-count {
          font-size: 12px;
          color: var(--gray-500);
          padding: 4px 12px;
          background: rgba(255,255,255,0.06);
          border-radius: 100px;
          font-family: 'JetBrains Mono', monospace;
        }
        .chrome-monitor-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px;
        }
        .chrome-monitor-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-2);
          border-radius: 12px;
          transition: all 0.2s;
        }
        .chrome-monitor-card.ok {
          border-color: rgba(16,185,129,0.3);
          background: linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%);
        }
        .chrome-monitor-card.warn {
          border-color: rgba(245,158,11,0.4);
          background: linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.01) 100%);
        }
        .chrome-monitor-card.down {
          border-color: rgba(239,68,68,0.5);
          background: linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.02) 100%);
          animation: chromeDownPulse 2s ease-in-out infinite;
        }
        @keyframes chromeDownPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        .chrome-monitor-status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .chrome-monitor-card.ok .chrome-monitor-status-dot {
          background: #10b981;
          box-shadow: 0 0 12px rgba(16,185,129,0.6);
        }
        .chrome-monitor-card.warn .chrome-monitor-status-dot {
          background: #f59e0b;
          box-shadow: 0 0 12px rgba(245,158,11,0.6);
        }
        .chrome-monitor-card.down .chrome-monitor-status-dot {
          background: #ef4444;
          box-shadow: 0 0 12px rgba(239,68,68,0.7);
        }
        .chrome-monitor-card-info {
          flex: 1;
          min-width: 0;
        }
        .chrome-monitor-name {
          color: var(--white);
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chrome-monitor-time {
          font-size: 11px;
          color: var(--gray-500);
          font-family: 'JetBrains Mono', monospace;
        }
        .chrome-monitor-card.warn .chrome-monitor-time {
          color: #fbbf24;
        }
        .chrome-monitor-card.down .chrome-monitor-time {
          color: #fca5a5;
          font-weight: 700;
        }

        .admin-filter-bar {
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .admin-filter-bar input {
          flex: 1;
          padding: 16px 22px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
          color: var(--white);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .admin-filter-bar input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.1);
        }

        .clients-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 18px;
        }

        .client-card {
          position: relative;
          padding: 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 22px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
          animation: fadeUp 0.5s ease-out both;
        }

        .client-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, var(--primary), var(--accent), transparent);
          opacity: 0.6;
        }

        .client-card:hover {
          transform: translateY(-6px);
          border-color: var(--accent);
          box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,95,0.2);
        }

        .client-card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }

        .client-avatar {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 6px 20px rgba(196,30,58,0.3);
        }

        .client-info { flex: 1; min-width: 0; }

        .client-name {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .client-handle {
          font-size: 12px;
          color: var(--gray-500);
          font-family: 'JetBrains Mono', monospace;
        }

        .client-browsers {
          margin-top: 4px;
          font-size: 11px;
          color: var(--primary);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }

        .client-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
        }

        .client-stat {
          padding: 10px 8px;
          background: var(--surface);
          border-radius: 10px;
          text-align: center;
        }

        .client-stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 4px;
        }

        .client-stat.total .client-stat-value { color: var(--accent); }
        .client-stat.active .client-stat-value { color: var(--success); }
        .client-stat.paused .client-stat-value { color: var(--danger); }

        .client-stat-label {
          font-size: 9px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 700;
        }

        .client-rent {
          margin-bottom: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 600;
        }

        /* Pill especial para clientes con posts bloqueados (cuenta MP baneada).
           Aparece encima de client-rent. Pulsa para llamar atención. */
        .client-banned-pill {
          margin-bottom: 10px;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%);
          border: 1.5px solid rgba(239,68,68,0.45);
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: clientBannedPulse 2.5s ease-in-out infinite;
        }
        @keyframes clientBannedPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
          50% { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
        .client-banned-icon {
          font-size: 22px;
          flex-shrink: 0;
          filter: drop-shadow(0 0 6px rgba(239,68,68,0.5));
        }
        .client-banned-info {
          flex: 1;
          min-width: 0;
        }
        .client-banned-title {
          font-size: 11px;
          font-weight: 800;
          color: #fca5a5;
          letter-spacing: 1px;
          margin-bottom: 2px;
        }
        .client-banned-sub {
          font-size: 11px;
          font-weight: 600;
          color: #f87171;
          opacity: 0.85;
        }

        .client-rent.active {
          background: rgba(16,185,129,0.08);
          border: 1px solid rgba(16,185,129,0.2);
          color: var(--success);
        }

        .client-rent.warning {
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          color: var(--warning);
          animation: clientRentPulse 2s ease-in-out infinite;
        }

        .client-rent.expired {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
          animation: clientRentPulse 1.5s ease-in-out infinite;
        }

        .client-rent.none {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--gray-500);
        }

        @keyframes clientRentPulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 0 3px currentColor; opacity: 0.95; }
        }

        .client-rent-icon { font-size: 14px; line-height: 1; }
        .client-rent-text {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        .client-action {
          width: 100%;
          padding: 12px;
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .client-card:hover .client-action {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          border-color: var(--accent);
          color: #1a1a1a;
        }

        .clients-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 80px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 24px;
        }

        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 24px;
        }

        .post-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 28px;
          overflow: hidden;
          transition: all 0.5s cubic-bezier(0.22,1,0.36,1);
          animation: fadeUp 0.6s ease-out both;
        }

        .post-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        }

        .post-card.paused { opacity: 0.92; }

        /* Warning glow en el borde de la card */
        .post-card.warning {
          border-color: rgba(245,158,11,0.4);
          box-shadow: 0 0 0 1px rgba(245,158,11,0.2), 0 0 30px rgba(245,158,11,0.1);
        }

        .pc-mesh {
          position: relative;
          height: 110px;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.25) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(212,175,95,0.15) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.1) 0%, transparent 50%);
          overflow: hidden;
        }

        .post-card.paused .pc-mesh {
          background:
            radial-gradient(at 20% 30%, rgba(239,68,68,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(107,107,133,0.1) 0%, transparent 50%);
          filter: grayscale(0.3);
        }

        .pc-mesh::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 60%, var(--bg-2) 100%);
        }

        .pc-mesh-content {
          position: relative;
          z-index: 1;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          height: 100%;
        }

        .pc-id-block { display: flex; flex-direction: column; }

        .pc-id-tiny {
          font-size: 10px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2.5px;
          font-weight: 700;
          margin-bottom: 6px;
          opacity: 0.7;
        }

        .pc-id-big {
          font-family: 'JetBrains Mono', monospace;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: var(--white);
        }

        .pc-id-big .hash { color: var(--gray-500); }

        .pc-browser {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          font-family: 'JetBrains Mono', monospace;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          background: rgba(244, 114, 182, 0.12);
          border: 1px solid rgba(244, 114, 182, 0.25);
          border-radius: 100px;
        }

        .pc-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(10px);
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-badge.active { color: var(--success); border: 1px solid rgba(16,185,129,0.3); }
        .pc-badge.paused { color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

        .pc-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .pc-badge.active .pc-badge-dot {
          box-shadow: 0 0 12px currentColor;
          animation: dotPulse 1.5s infinite;
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .pc-timer-section {
          padding: 4px 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .pc-ring-container {
          position: relative;
          width: 200px;
          height: 200px;
          margin-bottom: 8px;
        }

        .pc-ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }

        .pc-ring-bg { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 8; }

        .pc-ring-progress {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
          transition: stroke-dashoffset 1s linear;
        }

        .post-card.active .pc-ring-progress { stroke: url(#gradActive); }
        .post-card.paused .pc-ring-progress { stroke: url(#gradPaused); opacity: 0.5; }

        .pc-ring-center {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .pc-time-value {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -2px;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--white) 0%, var(--gray-300) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .post-card.paused .pc-time-value {
          background: linear-gradient(135deg, var(--gray-500) 0%, var(--gray-700) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pc-time-divider {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          color: var(--gray-700);
          margin: 0 2px;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .pc-time-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-top: 8px;
        }

        .pc-time-row { display: flex; align-items: flex-end; }

        /* ===== BANNER DE ADVERTENCIA ===== */
        .pc-warning {
          margin: 0 24px 20px;
          padding: 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%);
          border: 1px solid rgba(245,158,11,0.4);
          position: relative;
          overflow: hidden;
          animation: warningPulse 2s ease-in-out infinite;
        }

        @keyframes warningPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.2); }
          50% { box-shadow: 0 0 0 4px rgba(245,158,11,0.08); }
        }

        .pc-warning-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pc-warning-icon {
          font-size: 18px;
          animation: shake 0.8s ease-in-out infinite;
        }

        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        .pc-warning-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--warning);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-warning-text {
          font-size: 12px;
          color: var(--gray-300);
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .pc-warning-text strong { color: var(--white); }

        .pc-warning-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, var(--whatsapp) 0%, #1da851 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 6px 20px rgba(37,211,102,0.3);
        }

        .pc-warning-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 26px rgba(37,211,102,0.45);
        }

        .pc-rent {
          margin: 0 24px 20px;
          padding: 16px 18px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pc-rent.active {
          background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }
        .pc-rent.expired {
          background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .pc-rent.none {
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .pc-rent-info { display: flex; flex-direction: column; }

        .pc-rent-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pc-rent-value {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .pc-rent.active .pc-rent-value { color: var(--success); }
        .pc-rent.expired .pc-rent-value { color: var(--danger); }
        .pc-rent.none .pc-rent-value { color: var(--gray-500); font-size: 14px; }

        .pc-rent-actions { display: flex; gap: 6px; }

        .rent-btn {
          padding: 8px 12px;
          background: var(--bg-3);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .rent-btn:hover { border-color: var(--accent); color: var(--accent); }

        .rent-btn.renew {
          background: linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%);
          border-color: rgba(16,185,129,0.3);
          color: var(--success);
        }

        .rent-btn.renew:hover {
          background: linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.1) 100%);
        }

        .rent-btn.remove:hover { border-color: var(--danger); color: var(--danger); }

        .pc-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 0 24px;
          margin-bottom: 20px;
        }

        .pc-meta-cell {
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
        }

        .pc-meta-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .pc-meta-value {
          font-size: 14px;
          color: var(--white);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .pc-actions {
          padding: 0 24px 24px;
          display: grid;
          gap: 10px;
        }

        .pc-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .action-btn {
          padding: 14px 18px;
          border: none;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.3px;
          position: relative;
          overflow: hidden;
        }

        .action-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .action-btn:hover::before { opacity: 1; }

        .btn-pause {
          background: linear-gradient(135deg, var(--danger) 0%, #dc2626 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(239,68,68,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-resume {
          background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(16,185,129,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-pause:hover, .btn-resume:hover { transform: translateY(-2px); }

        .btn-view {
          background: linear-gradient(135deg, var(--info) 0%, #2563eb 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(59,130,246,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-view:hover { transform: translateY(-2px); }

        .btn-delete-post {
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(239,68,68,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-delete-post:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }

        .btn-delete-post:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-edit {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .btn-edit:hover { border-color: var(--accent); color: var(--accent); background: rgba(212,175,95,0.06); }

        /* ===== Estados de edición en la card ===== */
        .edit-status {
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .edit-status.pending {
          background: linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.03) 100%);
          border: 1px solid rgba(59,130,246,0.25);
          color: var(--info);
          justify-content: space-between;
        }

        .edit-status.ready {
          flex-direction: column;
          gap: 8px;
          padding: 0;
          background: transparent;
        }

        .edit-status.publishing {
          background: linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.03) 100%);
          border: 1px solid rgba(245,158,11,0.3);
          color: var(--warning);
          justify-content: center;
          font-weight: 600;
        }

        .edit-status.waiting-bump {
          background: linear-gradient(135deg, rgba(212,175,95,0.12) 0%, rgba(212,175,95,0.04) 100%);
          border: 1px solid rgba(212,175,95,0.35);
          color: #d4af5f;
          justify-content: center;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .edit-status.applied {
          background: linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%);
          border: 1px solid rgba(16,185,129,0.3);
          color: var(--success);
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }

        .edit-status.failed {
          background: linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.03) 100%);
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
          font-size: 12px;
          justify-content: center;
        }

        .edit-status-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .edit-status-spinner {
          font-size: 22px;
          animation: spin 2s linear infinite;
          display: inline-block;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .edit-status-title {
          font-weight: 700;
          font-size: 13px;
          margin-bottom: 2px;
        }

        .edit-status-sub {
          font-size: 11px;
          color: var(--gray-500);
          font-weight: 500;
        }

        .edit-cancel-btn {
          padding: 8px 14px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          color: var(--gray-300);
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .edit-cancel-btn:hover {
          color: var(--danger);
          border-color: var(--danger);
        }

        .edit-cancel-btn.small {
          width: 100%;
          padding: 10px;
        }

        .btn-edit-ready {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%) !important;
          color: #1a1a1a !important;
          border: none !important;
          font-weight: 800 !important;
          box-shadow: 0 6px 22px rgba(212,175,95,0.4), 0 1px 0 rgba(255,255,255,0.3) inset !important;
          animation: pulseReady 2s ease-in-out infinite;
        }

        @keyframes pulseReady {
          0%, 100% { box-shadow: 0 6px 22px rgba(212,175,95,0.4), 0 1px 0 rgba(255,255,255,0.3) inset; }
          50% { box-shadow: 0 6px 30px rgba(212,175,95,0.7), 0 1px 0 rgba(255,255,255,0.3) inset; }
        }

        /* ===== Modal de edición ===== */
        .edit-modal {
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          padding: 32px;
          max-width: 580px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        .edit-modal-captcha {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 22px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: 16px;
          margin-bottom: 22px;
        }

        .edit-modal-captcha img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          background: white;
          padding: 8px;
        }

        .edit-modal-captcha-input {
          width: 100%;
          padding: 14px 18px;
          background: var(--bg-3);
          border: 1.5px solid var(--border-2);
          border-radius: 10px;
          color: var(--white);
          font-size: 16px;
          font-family: 'JetBrains Mono', monospace;
          text-align: center;
          letter-spacing: 4px;
          font-weight: 700;
          text-transform: uppercase;
          outline: none;
        }

        .edit-modal-captcha-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(212,175,95,0.15);
        }

        .edit-modal-timer {
          font-size: 12px;
          color: var(--warning);
          font-weight: 700;
          padding: 6px 12px;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 100px;
        }

        .edit-modal-section {
          margin-bottom: 18px;
        }

        .edit-modal-section-title {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }

        .edit-modal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        .edit-modal-field {
          display: flex;
          flex-direction: column;
        }

        .edit-modal-field.full { grid-column: 1 / -1; }

        .edit-modal-field label {
          font-size: 11px;
          color: var(--gray-500);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .edit-modal-field input, .edit-modal-field textarea {
          padding: 12px 14px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--white);
          font-family: inherit;
          font-size: 14px;
          outline: none;
          transition: all 0.2s;
        }

        .edit-modal-field input:focus, .edit-modal-field textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(212,175,95,0.1);
        }

        .edit-modal-field textarea {
          min-height: 120px;
          resize: vertical;
          font-family: inherit;
        }

        /* ===== Selector de City (botón que abre el modal) ===== */
        .city-selector-btn {
          padding: 12px 14px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--white);
          font-family: inherit;
          font-size: 14px;
          outline: none;
          cursor: pointer;
          text-align: left;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .city-selector-btn:hover {
          border-color: var(--accent);
        }

        .city-placeholder {
          color: var(--gray-500);
        }

        .city-selected {
          color: var(--white);
        }

        .city-selector-arrow {
          color: var(--gray-500);
          font-size: 11px;
        }

        /* ===== Modal de selección de ubicación (estilo MegaPersonals) ===== */
        .location-modal {
          background: white;
          border-radius: 16px;
          padding: 24px 18px 18px 18px;
          max-width: 380px;
          width: 92%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 25px 80px rgba(0,0,0,0.5);
          position: relative;
          animation: fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both;
        }

        .location-close-btn {
          position: absolute;
          top: -14px;
          right: -14px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #5a5a5a;
          color: white;
          border: 3px solid white;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-family: inherit;
        }

        .location-close-btn:hover {
          background: #ef4444;
        }

        .location-title {
          color: #4FC3F7;
          font-size: 22px;
          font-weight: 800;
          text-align: center;
          margin-bottom: 18px;
          letter-spacing: 0.5px;
        }

        /* Botón naranja "United States" - estilo MegaPersonals */
        .location-region-btn {
          width: 100%;
          padding: 14px 18px;
          background: linear-gradient(180deg, #F5A623 0%, #E89714 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 17px;
          font-weight: 700;
          text-align: left;
          cursor: default;
          margin-bottom: 8px;
          font-family: inherit;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }

        .location-states-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .location-state-group {
          display: flex;
          flex-direction: column;
        }

        /* Botones azul claro de los estados */
        .location-state-btn {
          width: 100%;
          padding: 13px 18px;
          background: linear-gradient(180deg, #4FC3F7 0%, #29B6F6 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: filter 0.15s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08);
        }

        .location-state-btn:hover {
          filter: brightness(1.08);
        }

        .location-state-btn.expanded {
          background: linear-gradient(180deg, #81D4FA 0%, #4FC3F7 100%);
        }

        .location-state-icon {
          font-size: 22px;
          line-height: 1;
          font-weight: 400;
          opacity: 0.95;
        }

        /* Lista de ciudades de un estado expandido */
        .location-cities-list {
          display: flex;
          flex-direction: column;
          padding: 4px 0 4px 24px;
          background: rgba(79,195,247,0.04);
          border-left: 3px solid #4FC3F7;
          margin: 2px 0 4px 12px;
          border-radius: 0 8px 8px 0;
        }

        .location-city-btn {
          padding: 9px 14px;
          background: transparent;
          border: none;
          color: #333;
          font-size: 14px;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          border-radius: 6px;
          transition: all 0.15s;
          font-weight: 500;
        }

        .location-city-btn:hover {
          background: rgba(79,195,247,0.15);
          color: #0277BD;
          padding-left: 18px;
        }

        /* ============================================
         * MODAL MEGAPERSONALS 1:1 — réplica exacta del estilo Candy Crush
         * ============================================ */
        .mp-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 20px;
          overflow-y: auto;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .mp-modal {
          position: relative;
          width: 100%;
          max-width: 600px;
          background: linear-gradient(rgb(253, 52, 171) 0%, rgb(255, 255, 255) 100%);
          padding: 21px 0;
          font-family: Arial, "sans serif";
          font-size: 14px;
          color: #333;
          box-shadow: 0 25px 80px rgba(0,0,0,0.5);
          margin: 20px 0;
          animation: mpSlide 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes mpSlide {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .mp-close-x {
          position: absolute;
          top: -15px;
          right: -15px;
          width: 50px;
          height: 50px;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          z-index: 10;
        }

        .mp-close-x img {
          width: 100%;
          height: 100%;
        }

        .mp-timer {
          position: absolute;
          top: 10px;
          left: 10px;
          background: rgba(255,255,255,0.95);
          color: #d63384;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 3px 10px rgba(0,0,0,0.2);
          z-index: 5;
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        /* Bordes decorativos rosa (4 lados) */
        .mp-topborder,
        .mp-bottomborder,
        .mp-leftborder,
        .mp-rightborder {
          position: absolute;
          pointer-events: none;
          background-repeat: repeat;
        }
        .mp-topborder {
          top: 0; left: 0; right: 0;
          height: 21px;
          background-image: url("/megapersonals-img/topborder.png");
          background-repeat: repeat-x;
        }
        .mp-bottomborder {
          bottom: 0; left: 0; right: 0;
          height: 21px;
          background-image: url("/megapersonals-img/bottomborder.png");
          background-repeat: repeat-x;
        }
        .mp-leftborder {
          top: 21px; bottom: 21px; left: 0;
          width: 21px;
          background-image: url("/megapersonals-img/leftborder.png");
          background-repeat: repeat-y;
        }
        .mp-rightborder {
          top: 21px; bottom: 21px; right: 0;
          width: 21px;
          background-image: url("/megapersonals-img/rightborder.png");
          background-repeat: repeat-y;
        }

        .mp-header-logo {
          text-align: center;
          padding: 20px 20px 10px;
          position: relative;
          z-index: 2;
        }
        .mp-header-logo img {
          max-width: 90%;
          height: auto;
        }

        .mp-stage {
          padding: 0 20px;
          position: relative;
          z-index: 2;
        }

        .mp-banner {
          text-align: center;
          margin-bottom: 10px;
        }
        .mp-banner img {
          max-width: 100%;
          height: auto;
        }

        .mp-form {
          width: 100%;
        }

        .mp-row {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
        }

        .mp-row-2 > .mp-field {
          flex: 1;
        }

        .mp-field {
          display: flex;
          flex-direction: column;
        }

        .mp-field-full {
          flex: 1;
          width: 100%;
        }

        .mp-label {
          color: rgba(248, 208, 7, 0.91); /* amarillo MegaPersonals */
          font-family: Helvetica, Arial, sans-serif;
          font-size: 16px;
          font-weight: 600;
          font-style: italic;
          margin-bottom: 5px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.15);
        }

        .mp-input {
          background: #fff;
          border: 2px solid rgb(136, 136, 136);
          border-radius: 5px;
          padding: 6px 12px;
          font-family: Arial, "sans serif";
          font-size: 14px;
          color: #333;
          width: 100%;
          height: 34px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }

        .mp-input:focus {
          border-color: #d63384;
        }

        .mp-input.mp-disabled {
          background: rgb(238, 238, 238);
          color: #666;
          cursor: not-allowed;
        }

        .mp-textarea {
          height: 200px !important;
          padding: 8px 12px;
          resize: vertical;
          font-family: Arial, "sans serif";
        }

        .mp-city-btn {
          text-align: left;
          cursor: pointer;
          background: #fff;
        }
        .mp-city-btn:hover {
          border-color: #d63384;
        }

        .mp-phone-wrapper {
          display: flex;
          gap: 4px;
        }
        .mp-phone-code {
          width: 70px !important;
          flex-shrink: 0;
          text-align: center;
        }
        .mp-phone-number {
          flex: 1;
        }

        .mp-button-row {
          text-align: center;
          margin: 30px 0 10px;
        }

        .mp-btn-next {
          width: 130px;
          height: 60px;
          background-image: url("/megapersonals-img/button_next.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          color: white;
          font-size: 18px;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-next:hover {
          transform: scale(1.05);
        }
        .mp-btn-next:active {
          transform: scale(0.97);
        }

        .mp-cancel-row {
          text-align: center;
          margin: 15px 0 5px;
        }

        .mp-cancel {
          background: rgba(255,255,255,0.6);
          border: 1px solid rgba(0,0,0,0.15);
          color: #666;
          padding: 8px 18px;
          border-radius: 100px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .mp-cancel:hover {
          background: white;
          color: #d63384;
        }
        .mp-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ========== Pestaña 2: Photos + Videos + Captcha ========== */
        .mp-section-locked {
          margin-bottom: 24px;
          position: relative;
        }

        .mp-section-title {
          color: rgba(248, 208, 7, 0.91);
          font-family: Helvetica, Arial, sans-serif;
          font-size: 16px;
          font-weight: 700;
          font-style: italic;
          margin-bottom: 10px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }

        .mp-letter {
          display: inline-block;
          width: 28px;
          height: 28px;
          line-height: 28px;
          background: #4FC3F7;
          color: white;
          border-radius: 50%;
          text-align: center;
          font-weight: bold;
          font-style: normal;
          margin-right: 8px;
          font-family: Arial, sans-serif;
          font-size: 16px;
        }
        .mp-letter-c {
          background: #FFA726;
        }

        .mp-locked-content {
          position: relative;
          padding: 15px;
          background: rgba(255,255,255,0.6);
          border: 2px dashed rgba(214, 51, 132, 0.4);
          border-radius: 10px;
        }

        .mp-locked-msg {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(214, 51, 132, 0.95);
          color: white;
          padding: 14px 24px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          z-index: 5;
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          white-space: nowrap;
        }

        .mp-locked-sub {
          font-size: 11px;
          font-weight: 400;
          opacity: 0.9;
          margin-top: 4px;
          white-space: normal;
          max-width: 250px;
        }

        .mp-photos-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          opacity: 0.4;
          pointer-events: none;
        }

        .mp-videos-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          opacity: 0.4;
          pointer-events: none;
        }

        .mp-photo-cell {
          aspect-ratio: 1 / 1;
          background: #ddd;
          border-radius: 4px;
          overflow: hidden;
        }
        .mp-photo-cell img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Captcha */
        .mp-captcha-section {
          margin: 24px 0;
          padding: 18px;
          background: rgba(255,255,255,0.7);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .mp-captcha-image-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mp-captcha-image {
          background: white;
          padding: 4px;
          border-radius: 4px;
          max-width: 100%;
          height: auto;
        }

        .mp-captcha-reload {
          width: 40px;
          height: 40px;
          opacity: 0.5;
          cursor: not-allowed;
        }
        .mp-captcha-reload img {
          width: 100%;
          height: 100%;
        }

        .mp-captcha-input {
          max-width: 320px;
          text-align: center;
          font-size: 16px !important;
          letter-spacing: 3px;
          font-weight: 700;
          text-transform: uppercase;
        }

        /* Botones Back y Publish */
        .mp-buttons-final {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 30px 20px 10px;
        }

        .mp-btn-back {
          width: 90px;
          height: 45px;
          background-image: url("/megapersonals-img/button_back.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-back:hover { transform: scale(1.05); }
        .mp-btn-back:active { transform: scale(0.97); }
        .mp-btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

        .mp-btn-publish {
          width: 150px;
          height: 60px;
          background-image: url("/megapersonals-img/button_publish.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-publish:hover { transform: scale(1.05); }
        .mp-btn-publish:active { transform: scale(0.97); }
        .mp-btn-publish:disabled { opacity: 0.6; cursor: not-allowed; }

        /* MOBILE: adaptar para pantallas pequeñas */
        @media (max-width: 640px) {
          .mp-modal {
            margin: 10px 0;
            padding: 15px 0;
          }
          .mp-stage {
            padding: 0 14px;
          }
          .mp-row-2 {
            flex-direction: column;
          }
          .mp-photos-grid,
          .mp-videos-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .mp-locked-msg {
            font-size: 13px;
            padding: 10px 14px;
            white-space: normal;
            max-width: 80%;
          }
          .mp-buttons-final {
            margin: 24px 10px 10px;
          }
          .mp-close-x {
            width: 40px;
            height: 40px;
            top: -10px;
            right: -10px;
          }
          .mp-timer {
            font-size: 11px;
            padding: 5px 10px;
          }
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 100px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 28px;
        }

        .empty-state-icon { font-size: 64px; margin-bottom: 24px; }
        .empty-state-text { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--white); }
        .empty-state-sub { font-size: 14px; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card {
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          padding: 36px 32px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        .modal-title {
          font-family: 'Syne', sans-serif;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .modal-subtitle {
          font-size: 13px;
          color: var(--gray-500);
          margin-bottom: 28px;
        }

        .modal-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 24px;
        }

        .modal-field { display: flex; flex-direction: column; }
        .modal-field label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .modal-field input {
          padding: 16px 20px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          color: var(--white);
          font-size: 18px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          text-align: center;
          outline: none;
          transition: all 0.2s;
        }

        .modal-field input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.12);
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .modal-btn {
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-btn-primary {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          box-shadow: 0 6px 20px rgba(212,175,95,0.3);
        }

        .modal-btn-primary:hover { transform: translateY(-2px); }

        .modal-btn-secondary {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .modal-btn-secondary:hover { background: var(--bg-3); }

        @media (max-width: 640px) {
          .page { padding: 20px 16px; }
          .dash-header { flex-direction: column; align-items: flex-start; padding: 20px; }
          .dash-greeting h1 { font-size: 24px; }
          .posts-grid, .clients-grid { grid-template-columns: 1fr; gap: 16px; }
          .pc-ring-container { width: 180px; height: 180px; }
          .pc-time-value, .pc-time-divider { font-size: 38px; }
          .stat-pill { min-width: 100%; }
          .pc-rent { flex-direction: column; align-items: flex-start; }
          .pc-rent-actions { width: 100%; }
          .rent-btn { flex: 1; justify-content: center; }
        }
`;

export default function EstilosGlobales() {
  return <style>{ESTILOS_GLOBALES}</style>;
}
