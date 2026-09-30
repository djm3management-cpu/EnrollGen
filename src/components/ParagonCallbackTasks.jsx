import { useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '../context/AuthContext';
import { fetchWithClerk } from '../lib/clerkFetch';

export default function ParagonCallbackTasks() {
  const { getToken } = useAppAuth();
  const [tasks,setTasks] = useState([]);
  const [error,setError] = useState('');
  const refresh = useCallback(async () => {
    const response = await fetchWithClerk(getToken,'/.netlify/functions/paragon-zip-confirm');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load callbacks.');
    setTasks(body.tasks || []);
  },[getToken]);
  useEffect(() => {
    refresh().catch(err => setError(err.message));
    const timer = window.setInterval(() => refresh().catch(err => setError(err.message)),60000);
    return () => window.clearInterval(timer);
  },[refresh]);
  const complete = async id => {
    try {
      const response = await fetchWithClerk(getToken,'/.netlify/functions/paragon-zip-confirm',{
        method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action:'complete',task_id:id }),
      });
      if (!response.ok) throw new Error('Unable to complete callback.');
      await refresh();
    } catch(err) { setError(err.message); }
  };
  if (!tasks.length && !error) return null;
  return <section className="agent-dash-card paragon-callbacks">
    <h2>Paragon callbacks</h2>
    {error && <div role="alert">{error}</div>}
    {tasks.map(task => <div className="paragon-callbacks__row" key={task.id}>
      <span>{task.caller_phone || 'Caller'} · {task.caller_state} · ZIP {task.confirmed_zip}</span>
      <button type="button" onClick={() => complete(task.id)}>Mark completed</button>
    </div>)}
  </section>;
}
