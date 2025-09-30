import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { listCalls, getCacheStats, retryFailedSyncs } from '../api/client';
import './Dashboard.css';

interface Call {
  id: number;
  retellCallId: string;
  phoneNumber: string | null;
  status: string;
  duration: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface CacheStats {
  pending: number;
  synced: number;
  failed: number;
  total: number;
}

function Dashboard() {
  const queryClient = useQueryClient();

  const { data: callsData, isLoading: callsLoading } = useQuery({
    queryKey: ['calls'],
    queryFn: listCalls,
    refetchInterval: 10000,
  });

  const { data: cacheData, isLoading: cacheLoading } = useQuery({
    queryKey: ['cacheStats'],
    queryFn: getCacheStats,
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: retryFailedSyncs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cacheStats'] });
    },
  });

  const calls: Call[] = callsData?.calls || [];
  const stats: CacheStats = cacheData?.stats || { pending: 0, synced: 0, failed: 0, total: 0 };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Healthcare Scheduling Dashboard</h1>
        <p className="subtitle">The Practice - Jacksonville, FL</p>
      </header>

      <div className="dashboard-actions">
        <Link href="/voice">
          <button className="btn btn-primary">
            🎙️ Start Voice Call
          </button>
        </Link>
      </div>

      <div className="dashboard-grid">
        {/* Cache Statistics */}
        <section className="card">
          <h2>Write-Behind Cache</h2>
          {cacheLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <span className="stat-label">Pending</span>
                  <span className="stat-value pending">{stats.pending}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Synced</span>
                  <span className="stat-value synced">{stats.synced}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Failed</span>
                  <span className="stat-value failed">{stats.failed}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total</span>
                  <span className="stat-value">{stats.total}</span>
                </div>
              </div>
              {stats.failed > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                >
                  {retryMutation.isPending ? 'Retrying...' : 'Retry Failed Syncs'}
                </button>
              )}
            </>
          )}
        </section>

        {/* Recent Calls */}
        <section className="card calls-section">
          <h2>Recent Voice Calls</h2>
          {callsLoading ? (
            <p>Loading...</p>
          ) : calls.length === 0 ? (
            <p className="empty-state">No calls yet. Start your first voice call!</p>
          ) : (
            <div className="calls-list">
              {calls.slice(0, 10).map((call) => (
                <div key={call.id} className="call-item">
                  <div className="call-info">
                    <span className={`call-status status-${call.status}`}>
                      {call.status}
                    </span>
                    <span className="call-phone">
                      {call.phoneNumber || 'Web Call'}
                    </span>
                  </div>
                  <div className="call-meta">
                    <span className="call-time">
                      {new Date(call.startedAt).toLocaleString()}
                    </span>
                    {call.duration && (
                      <span className="call-duration">
                        {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Provider Information */}
        <section className="card">
          <h2>Provider Schedules</h2>
          <div className="providers-list">
            <div className="provider-item">
              <h3>Charles Maddix</h3>
              <p>Monday - Thursday: 10:30 AM - 6:00 PM</p>
            </div>
            <div className="provider-item">
              <h3>Ava Suleiman</h3>
              <p>Tuesday: 10:30 AM - 6:00 PM</p>
            </div>
            <div className="provider-item">
              <h3>Dr. Soto</h3>
              <p>Monday - Thursday: 4:00 PM - 6:00 PM</p>
              <p className="note">Follow-ups only</p>
            </div>
          </div>
        </section>

        {/* Insurance Information */}
        <section className="card">
          <h2>Accepted Insurance</h2>
          <ul className="insurance-list">
            <li>✅ Aetna (in-network)</li>
            <li>✅ Florida Blue / BCBS (in-network)</li>
            <li>✅ Cigna (in-network)</li>
            <li>✅ Medicare (in-network)</li>
            <li>✅ Tricare (in-network)</li>
            <li>❌ HMOs (not accepted)</li>
            <li>❌ Medicaid (not accepted)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;