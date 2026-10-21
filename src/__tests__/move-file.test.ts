import { MoveSave, decodeMove, encodeMove, isEncrypted } from '../move-file';
import { makeSave } from './save-helpers';

/** A live save with one prompt record whose preview must only travel encrypted. */
function aMove(): MoveSave {
  const s = makeSave();
  s.stores.bag.save({ yarn: 3, crab: 1 });
  s.progress.agentDone('a1');
  const turn = {
    promptId: 'p1',
    sessionId: 's',
    project: 'app',
    startedAt: 1,
    endedAt: 2,
    words: 2,
    chars: 9,
    actions: 1,
    subagents: 0,
    outputTokens: 1,
    outcome: 'done',
    preview: 'fix the login bug',
  };
  return {
    exportedAt: 123,
    slot: s.slots.current(),
    save: s.profiles.current(false),
    records: { turns: [turn], fame: { marathon: turn } },
    profiles: [],
    guests: [],
  };
}

describe('move file', () => {
  it('round-trips without a password, leaving out prompt previews', () => {
    const move = aMove();
    const text = encodeMove(move, '');
    expect(isEncrypted(text)).toBe(false);
    expect(text).not.toContain('fix the login bug');
    const back = decodeMove(text, '');
    expect(back.ok && back.move.save).toEqual(move.save);
    expect(back.ok && back.encrypted).toBe(false);
    expect(back.ok && (back.move.records.turns[0] as { preview: string }).preview).toBe('');
  });

  it('round-trips with a password, prompt previews and all', () => {
    const move = aMove();
    const text = encodeMove(move, 'correct horse');
    expect(isEncrypted(text)).toBe(true);
    expect(text).not.toContain('fix the login bug');
    expect(text).not.toContain('Rusty');
    const back = decodeMove(text, 'correct horse');
    expect(back.ok && back.move).toEqual(move);
  });

  it('uses a fresh salt and IV every time', () => {
    const move = aMove();
    const a = JSON.parse(encodeMove(move, 'correct horse'));
    const b = JSON.parse(encodeMove(move, 'correct horse'));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  });

  it('asks for the password when the file has one', () => {
    expect(decodeMove(encodeMove(aMove(), 'correct horse'), '')).toEqual({
      ok: false,
      reason: 'needs-password',
    });
  });

  it('rejects a wrong password, and any tampering, the same way', () => {
    const text = encodeMove(aMove(), 'correct horse');
    expect(decodeMove(text, 'wrong horse')).toEqual({ ok: false, reason: 'password' });
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, 'base64');
      bytes[0] ^= 1;
      return bytes.toString('base64');
    };
    type MoveFile = { data: string; cipher: { tag: string; iv: string }; kdf: { salt: string } };
    for (const change of [
      (f: MoveFile) => (f.data = flip(f.data)),
      (f: MoveFile) => (f.cipher.tag = flip(f.cipher.tag)),
      (f: MoveFile) => (f.cipher.iv = flip(f.cipher.iv)),
      (f: MoveFile) => (f.kdf.salt = flip(f.kdf.salt)),
    ]) {
      const bad = JSON.parse(text);
      change(bad);
      expect(decodeMove(JSON.stringify(bad), 'correct horse')).toEqual({
        ok: false,
        reason: 'password',
      });
    }
    // Asking for different scrypt work is refused before any is done.
    const greedy = JSON.parse(text);
    greedy.kdf.N = 2 ** 30;
    expect(decodeMove(JSON.stringify(greedy), 'correct horse').ok).toBe(false);
  });

  it('rejects a truncated or foreign file', () => {
    const text = encodeMove(aMove(), 'correct horse');
    expect(decodeMove(text.slice(0, text.length / 2), 'correct horse')).toEqual({
      ok: false,
      reason: 'damaged',
    });
    expect(decodeMove('{"format":"zip"}', '').ok).toBe(false);
    expect(decodeMove(JSON.stringify({ format: 'pet-agents-save', version: 1 }), '').ok).toBe(
      false,
    );
    const plain = JSON.parse(encodeMove(aMove(), ''));
    plain.save.save.pet.species = 'dragon';
    expect(decodeMove(JSON.stringify(plain), '')).toEqual({ ok: false, reason: 'damaged' });
  });

  it('refuses a file from a newer version with its own reason', () => {
    const file = JSON.parse(encodeMove(aMove(), ''));
    file.version = 2;
    expect(decodeMove(JSON.stringify(file), '')).toEqual({ ok: false, reason: 'version' });
  });

  it('refuses a file over 5 MB', () => {
    expect(decodeMove('x'.repeat(5 * 1024 * 1024 + 1), '')).toEqual({
      ok: false,
      reason: 'damaged',
    });
  });
});
