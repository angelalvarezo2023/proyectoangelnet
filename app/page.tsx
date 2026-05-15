"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [count, setCount] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(interval);
          window.location.href = "https://t.me/AngelVercelRentBot";
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #09090f;
          --card: #111118;
          --red: #c41e3a;
          --red-glow: rgba(196, 30, 58, 0.25);
          --gold: #d4af5f;
          --white: #f0f0f5;
          --muted: #6b6b80;
          --border: rgba(255,255,255,0.07);
        }

        html, body { height: 100%; background: var(--bg); }

        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* Grid de fondo */
        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Glow rojo esquina superior izquierda */
        .glow-tl {
          position: fixed;
          top: -120px;
          left: -120px;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(196,30,58,0.18) 0%, transparent 70%);
          pointer-events: none;
        }

        /* Glow dorado esquina inferior derecha */
        .glow-br {
          position: fixed;
          bottom: -100px;
          right: -100px;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,175,95,0.10) 0%, transparent 70%);
          pointer-events: none;
        }

        .card {
          position: relative;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 56px 48px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          box-shadow: 0 0 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Línea roja top */
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--red), transparent);
          border-radius: 1px;
        }

        .logo-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 28px;
          position: relative;
          background: rgba(196,30,58,0.06);
        }

        .logo-ring::after {
          content: '';
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.12);
        }

        .logo-ring span {
          font-size: 32px;
        }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 28px;
          color: var(--white);
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .brand span {
          color: var(--red);
        }

        .tagline {
          font-size: 13px;
          color: var(--muted);
          font-weight: 300;
          letter-spacing: 0.3px;
          margin-bottom: 40px;
        }

        .divider {
          width: 100%;
          height: 1px;
          background: var(--border);
          margin-bottom: 32px;
        }

        .redirect-label {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 16px;
        }

        .counter {
          font-family: 'Syne', sans-serif;
          font-size: 56px;
          font-weight: 800;
          color: var(--red);
          line-height: 1;
          margin-bottom: 8px;
          text-shadow: 0 0 40px rgba(196,30,58,0.4);
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .counter-sub {
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 36px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: var(--red);
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          font-size: 15px;
          padding: 14px 32px;
          border-radius: 12px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 24px rgba(196,30,58,0.3);
          width: 100%;
          justify-content: center;
        }

        .btn:hover {
          background: #a51830;
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(196,30,58,0.4);
        }

        .btn:active { transform: translateY(0); }

        .btn svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .footer-note {
          margin-top: 24px;
          font-size: 12px;
          color: var(--muted);
        }

        .footer-note a {
          color: var(--gold);
          text-decoration: none;
          opacity: 0.8;
        }
      `}</style>

      <div className="page">
        <div className="glow-tl" />
        <div className="glow-br" />

        <div className="card">
          <div className="logo-ring">
            <span>🌐</span>
          </div>

          <div className="brand">Angel<span>Vercel</span></div>
          <div className="tagline">Los mejores proxies del mercado, con GARANTÍA</div>

          <div className="divider" />

          <div className="redirect-label">Redirigiendo en</div>
          <div className="counter">{count}</div>
          <div className="counter-sub">Serás enviado a nuestro bot de Telegram</div>

          <a
            href="https://t.me/AngelVercelRentBot"
            className="btn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.48 14.26l-2.95-.924c-.64-.204-.654-.64.136-.949l11.57-4.461c.537-.194 1.006.131.326.322z"/>
            </svg>
            Ir al Bot ahora
          </a>

          <div className="footer-note">
            ¿Problemas? Contacta <a href="https://t.me/Soportetecnico2323">@Soportetecnico2323</a>
          </div>
        </div>
      </div>
    </>
  );
}
