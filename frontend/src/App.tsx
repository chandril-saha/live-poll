import { useEffect, useState } from 'react';
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { SwkAppDarkTheme, Networks } from "@creit.tech/stellar-wallets-kit/types";
import { Contract, rpc, TransactionBuilder, Address, nativeToScVal, Account, scValToNative, Keypair } from '@stellar/stellar-sdk';

const DUMMY_PUBKEY = Keypair.random().publicKey();

const CONTRACT_ID = "CBBADGQAX6F4NGXRKTC2UJ7P46RC6AVOZLK2EWKDR6QVFYSAG2IFXJGB";
const RPC_URL = "https://soroban-testnet.stellar.org:443";
const NETWORK_PASSPHRASE = Networks.TESTNET;

// Poll configuration — the contract handles 4 options (indices 0-3)
const POLL_QUESTION = "What will drive the next wave of Web3 adoption?";
const POLL_OPTIONS = [
  { id: 0, label: "DeFi & Payments", emoji: "💸" },
  { id: 1, label: "Gaming & NFTs", emoji: "🎮" },
  { id: 2, label: "DAOs & Governance", emoji: "🏛️" },
  { id: 3, label: "Real-World Assets", emoji: "🏠" },
];

const OPTION_COLORS = [
  "var(--clay-mint)",       // Neon Cyan
  "var(--clay-pink)",       // Vibrant Magenta
  "var(--clay-yellow)",     // Bright Yellow
  "var(--clay-blue)",       // Electric Blue
];

export default function App() {
  const [address, setAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0.00');

  // Poll state
  const [votes, setVotes] = useState<number[]>([0, 0, 0, 0]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // TX state
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'fail'>('idle');
  const [toast, setToast] = useState<{msg: string, type: 'error'|'success'} | null>(null);

  // Event feed
  const [events, setEvents] = useState<any[]>([]);

  // ── Wallet Kit Init ──
  useEffect(() => {
    try {
      StellarWalletsKit.init({
        theme: SwkAppDarkTheme,
        modules: defaultModules(),
      });
    } catch(e) {
      console.error(e);
    }

    const interval = setInterval(async () => {
      try {
        const addrObj = await StellarWalletsKit.getAddress();
        if (addrObj && addrObj.address !== address) {
          setAddress(addrObj.address);
          fetchBalance(addrObj.address);
        }
      } catch (_) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [address]);

  // ── Fetch poll data when address changes ──
  useEffect(() => {
    fetchPollData();
    if (address) {
      checkIfVoted(address);
    }
  }, [address]);

  // ── Poll votes periodically ──
  useEffect(() => {
    const pollInterval = setInterval(fetchPollData, 6000);
    return () => clearInterval(pollInterval);
  }, []);

  // ── Event stream ──
  useEffect(() => {
    let lastFetched = 0;

    const fetchEvents = async () => {
      try {
        const server = new rpc.Server(RPC_URL);
        const latestLedger = await server.getLatestLedger();
        
        // Fetch last 10 hours for initial load, then use cursor
        const startLedger = lastFetched || Math.max(0, latestLedger.sequence - 7200);

        const eventsReq = await server.getEvents({
          startLedger,
          filters: [{
            type: "contract",
            contractIds: [CONTRACT_ID]
          }],
          limit: 100
        });
        
        // Advance cursor so we only fetch new events next tick
        lastFetched = latestLedger.sequence;

        if (eventsReq?.events?.length > 0) {
          const newEvs = eventsReq.events.map(ev => ({
            id: ev.id,
            ledger: ev.ledger,
            type: ev.type,
          }));
          setEvents(prev => {
            const unique = [...newEvs, ...prev].reduce((acc: any[], curr) => {
              if (!acc.find((x: any) => x.id === curr.id)) acc.push(curr);
              return acc;
            }, []);
            return unique.slice(0, 20); // keep history short and clean
          });
        }
      } catch (e) {
        // Silently handle RPC timeouts or errors
      }
    };

    const evtInterval = setInterval(fetchEvents, 5000);
    fetchEvents();
    return () => clearInterval(evtInterval);
  }, []);

  // ── Data fetchers ──
  const fetchBalance = async (pubKey: string) => {
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${pubKey}`);
      if (!res.ok) throw new Error("Account not found");
      const data = await res.json();
      const xlm = data.balances.find((b: any) => b.asset_type === 'native');
      if (xlm) setBalance(xlm.balance);
    } catch (_) {
      setBalance('0.00');
    }
  };

  const fetchPollData = async () => {
    try {
      const server = new rpc.Server(RPC_URL);
      const contract = new Contract(CONTRACT_ID);
      const dummyAccount = new Account(DUMMY_PUBKEY, "0");

      const newVotes: number[] = [];
      for (let i = 0; i < 4; i++) {
        const tx = new TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(contract.call("get_votes", nativeToScVal(i, { type: 'u32' })))
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationSuccess(sim)) {
          // Try sim.result first, fall back to results array
          const retval = sim.result?.retval ?? (sim as any).results?.[0]?.xdr;
          if (retval) {
            const parsed = scValToNative(retval);
            console.log(`Option ${i} votes:`, parsed);
            newVotes.push(Number(parsed));
          } else {
            console.warn(`Option ${i}: simulation succeeded but no retval`);
            newVotes.push(0);
          }
        } else {
          console.warn(`Option ${i}: simulation failed`, sim);
          newVotes.push(0);
        }
      }
      setVotes(newVotes);
      setTotalVotes(newVotes.reduce((a, b) => a + b, 0));
    } catch (e) {
      console.error("Failed to fetch poll data:", e);
    }
  };

  const checkIfVoted = async (addr: string) => {
    try {
      const server = new rpc.Server(RPC_URL);
      const contract = new Contract(CONTRACT_ID);
      const dummyAccount = new Account(DUMMY_PUBKEY, "0");

      const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call("has_voted", new Address(addr).toScVal()))
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationSuccess(sim)) {
        const retval = sim.result?.retval ?? (sim as any).results?.[0]?.xdr;
        if (retval) {
          const voted = scValToNative(retval);
          console.log("has_voted:", voted);
          setHasVoted(Boolean(voted));
        }
      }
    } catch (e) {
      console.error("Failed to check voted status:", e);
    }
  };

  // ── Actions ──
  const showToast = (msg: string, type: 'error'|'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleVote = async (optionId: number) => {
    if (!address) {
      showToast("Please connect your wallet first.", "error");
      return;
    }
    if (hasVoted) {
      showToast("You've already cast your vote!", "error");
      return;
    }

    setSelectedOption(optionId);
    setTxStatus('pending');

    try {
      const server = new rpc.Server(RPC_URL);
      const sourceAccount = await server.getAccount(address);
      if (!sourceAccount) throw new Error("Account not funded on testnet.");

      const contract = new Contract(CONTRACT_ID);

      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: '10000',
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      txBuilder.addOperation(
        contract.call("cast_vote",
          new Address(address).toScVal(),
          nativeToScVal(optionId, { type: 'u32' })
        )
      );

      txBuilder.setTimeout(30);
      let tx = txBuilder.build();

      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        throw new Error("Vote simulation failed. You may have already voted or have insufficient balance.");
      }

      tx = rpc.assembleTransaction(tx, sim as any).build();

      try {
        const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: address,
        });

        const sendRes = await server.sendTransaction(
          TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE) as any
        );

        if (sendRes.status !== "ERROR") {
          let txResult = await server.getTransaction(sendRes.hash);
          while (txResult.status === "NOT_FOUND") {
            await new Promise(r => setTimeout(r, 2000));
            txResult = await server.getTransaction(sendRes.hash);
          }

          if (txResult.status === "SUCCESS") {
            setTxStatus('success');
            setHasVoted(true);
            showToast(`Vote recorded! Tx: ${sendRes.hash.substring(0, 8)}...`, "success");
            fetchPollData();
            fetchBalance(address);
          } else {
            setTxStatus('fail');
            showToast("Transaction failed on-chain.", "error");
          }
        } else {
          setTxStatus('fail');
          showToast(`Submit failed: ${sendRes.errorResult?.toXDR('base64') || 'Unknown'}`, "error");
        }
      } catch (signErr: any) {
        setTxStatus('fail');
        showToast(signErr.message || "Transaction rejected by wallet.", "error");
      }
    } catch (err: any) {
      setTxStatus('fail');
      showToast(err.message || "An error occurred.", "error");
    }
  };

  const connectWallet = async () => {
    try {
      const res = await StellarWalletsKit.authModal();
      if (res?.address) {
        setAddress(res.address);
        fetchBalance(res.address);
      }
    } catch (e: any) {
      showToast(e.message || "Failed to connect wallet", "error");
    }
  };

  const disconnectWallet = () => {
    try {
      StellarWalletsKit.disconnect();
      setAddress('');
      setBalance('0.00');
      setHasVoted(false);
    } catch (e) {
      console.error(e);
    }
  };

  // ── Render helpers ──
  const getPercentage = (count: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((count / totalVotes) * 100);
  };

  return (
    <div className="main-container">
      {/* ── Header ── */}
      <header className="header">
        <div>
          <h1>⬡ Live Poll</h1>
        </div>
        <div className="button-container">
          {address ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span className="address-badge">{address.substring(0, 6)}...{address.substring(50)}</span>
              <button className="btn outline" onClick={disconnectWallet}>Disconnect</button>
            </div>
          ) : (
            <button className="btn primary" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </header>

      {/* ── Balance ── */}
      {address && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Account Balance</h2>
            <div className="balance-readout">{balance} XLM</div>
          </div>
        </div>
      )}

      {/* ── Poll Question ── */}
      <div className="glass-panel poll-card">
        <h2 className="poll-question">{POLL_QUESTION}</h2>
        <p className="poll-subtitle">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast
          {hasVoted && <span className="voted-badge">✓ You voted</span>}
        </p>
        <hr className="section-divider" />

        {/* ── Vote Options ── */}
        <div className="poll-options">
          {POLL_OPTIONS.map((option, idx) => {
            const pct = getPercentage(votes[idx]);
            const isSelected = selectedOption === idx && hasVoted;

            return (
              <button
                key={option.id}
                className={`poll-option ${hasVoted ? 'revealed' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => handleVote(option.id)}
                disabled={hasVoted || txStatus === 'pending'}
              >
                <div className="poll-option-content">
                  <div className="poll-option-left">
                    <span className="poll-emoji">{option.emoji}</span>
                    <span className="poll-label">{option.label}</span>
                  </div>
                  <div className="poll-option-right">
                    {txStatus === 'pending' && selectedOption === idx && (
                      <span className="status-ring pending"></span>
                    )}
                    <span className="poll-count">{votes[idx]}</span>
                    <span className="poll-pct">{pct}%</span>
                  </div>
                </div>
                {/* Animated fill bar */}
                <div
                  className="poll-bar"
                  style={{
                    width: `${pct}%`,
                    background: OPTION_COLORS[idx],
                    opacity: hasVoted ? 0.30 : 0.12,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Event Feed ── */}
      <div className="glass-panel">
        <h2>Vote Activity</h2>
        <hr className="section-divider" />
        {events.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', margin: '0.8rem 0 0' }}>
            Listening for on-chain votes...
          </p>
        ) : (
          <div className="events-list">
            {events.map((e, idx) => (
              <div key={idx} className="event-item">
                <span className="badge">L-{e.ledger}</span>
                <span>Vote recorded on-chain</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <div className="toast-title">{toast.type === 'error' ? '✕ Error' : '✓ Success'}</div>
          <p className="toast-msg">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
