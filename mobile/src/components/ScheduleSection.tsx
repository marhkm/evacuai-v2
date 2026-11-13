import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Body, Button, Heading, Message } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { confirm } from '@/lib/confirm';

type Class = { subject: string; room_code: string | null; room: string; days: string; time_start: string; time_end: string };
const TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values'];

/**
 * The student's own class schedule (Profile page): the app's first guess of where they are during an alert.
 * Upload replaces the whole schedule; a file with any bad row is refused and every bad row is listed.
 */
export function ScheduleSection({ token }: { token: string | null }) {
  const [classes, setClasses] = useState<Class[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ classes: Class[] }>('/api/me/schedule', { token }).then(r => setClasses(r.classes)).catch(() => setClasses([])), [token]);
  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<void>) {
    setProblems([]);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      const err = e as ApiError;
      setProblems(err.errors?.file?.length ? err.errors.file : [err.message]);
    } finally {
      setBusy(false);
    }
  }

  const upload = () => run(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true });
    const file = picked.canceled ? null : picked.assets?.[0];
    if (!file) return;
    const form = new FormData();
    // Web gives a File (named, so the server sees .xlsx/.csv); phones give a file URI that React Native's FormData
    // uploads from disk, with the name inside the part.
    if (Platform.OS === 'web') form.append('file', file.file ?? (await (await fetch(file.uri)).blob()), file.name);
    else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob);
    setClasses((await api<{ classes: Class[] }>('/api/me/schedule', { method: 'POST', token, body: form })).classes);
  });

  const template = () => run(async () => {
    const { url } = await api<{ url: string }>('/api/me/schedule/template-link', { token });
    await Linking.openURL(url);
  });

  const remove = () => run(async () => {
    if (!(await confirm('Remove schedule?', 'Remove your class schedule?', 'Remove'))) return;
    await api('/api/me/schedule', { method: 'DELETE', token });
    setClasses([]);
  });

  return (
    <>
      <Heading>Class schedule</Heading>
      <Body muted>During an alert, the app uses your class room as your location. Fill in the template and upload it.</Body>
      {classes?.length === 0 ? <Body>No schedule uploaded</Body> : null}
      {classes?.map((c, i) => (
        <Body key={i}>{`${c.subject} · ${c.room_code ?? c.room} · ${c.days} ${c.time_start}–${c.time_end}`}</Body>
      ))}
      {problems.map(p => <Message key={p} text={p} />)}
      <Button label="Download template" variant="secondary" onPress={template} />
      <Button label="Upload schedule" busy={busy} onPress={upload} />
      {classes?.length ? <Button label="Remove schedule" variant="secondary" onPress={remove} /> : null}
    </>
  );
}
