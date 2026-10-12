import { Redirect } from 'expo-router';
import { useState } from 'react';

import { Chips, Section } from '@/components/Chips';
import { Button, Field, Message, Screen } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const RATINGS = [1, 2, 3, 4, 5].map(n => ({ key: String(n), label: '★'.repeat(n), a11yLabel: `${n} star${n > 1 ? 's' : ''}` }));

export default function FeedbackScreen() {
  const { state, token } = useAuth();
  const [rating, setRating] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  async function submit() {
    setError(null);
    setSent(null);
    if (!rating) return setError('Choose a rating from 1 to 5 stars.');
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/api/feedback', { method: 'POST', token, body: { rating: Number(rating), comments: comments.trim() || null } });
      setSent(res.message);
      setRating(null);
      setComments('');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Feedback">
      <Section label="How useful is EvacuAI?">
        <Chips items={RATINGS} active={rating} onSelect={setRating} />
      </Section>
      <Field label="Comments (optional)" value={comments} onChangeText={setComments} multiline maxLength={1000}
        placeholder="What worked? What was confusing?" autoCapitalize="sentences" />
      <Message text={error} />
      <Message text={sent} kind="info" />
      <Button label="Send feedback" onPress={submit} busy={busy} />
    </Screen>
  );
}
