const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  getDocs,
  query,
  collection,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('@firebase/firestore');

const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '..', 'firestore.rules');
const RULES = fs.readFileSync(RULES_PATH, 'utf8');

let testEnv;

const USERS = {
  alice: {
    uid: 'alice',
    name: 'Alice',
    displayName: 'Alice',
    handle: 'alice',
    emailVerified: true,
    collegeId: 'dypiu',
    collegeName: 'D Y Patil International University',
    course: 'B.Tech CSE',
    year: '2nd Year',
    connections: ['bob'],
    createdAt: '2026-01-01',
  },
  bob: {
    uid: 'bob',
    name: 'Bob',
    displayName: 'Bob',
    handle: 'bob',
    emailVerified: true,
    collegeId: 'dypiu',
    collegeName: 'D Y Patil International University',
    course: 'B.Tech CSE',
    year: '2nd Year',
    connections: ['alice'],
    createdAt: '2026-01-01',
  },
  other: {
    uid: 'other-college-user',
    name: 'Other',
    displayName: 'Other',
    handle: 'other',
    emailVerified: true,
    collegeId: 'other-college',
    collegeName: 'Other College',
    course: 'B.Tech CSE',
    year: '2nd Year',
    connections: [],
    createdAt: '2026-01-01',
  },
};

function dbAs(uid, emailVerified = true) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    email_verified: emailVerified,
  }).firestore();
}

const EMULATOR_BASE =
  'http://127.0.0.1:8080/v1/projects/weconnect-8fd01-expanded/databases/(default)/documents';

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])
        ),
      },
    };
  }
  throw new TypeError(`Unsupported seed value: ${typeof value}`);
}

async function seedDoc(pathname, data) {
  const encodedPath = pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetch(`${EMULATOR_BASE}/${encodedPath}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
      ),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to seed ${pathname}: ${response.status} ${await response.text()}`
    );
  }
}

async function seed() {
  await Promise.all(
    Object.values(USERS).map((user) => seedDoc(`users/${user.uid}`, user))
  );

  await seedDoc('userPrivate/alice', { email: 'alice@example.com' });
  await seedDoc('userPrivate/bob', { email: 'bob@example.com' });

  await seedDoc('chats/chat-alice-bob', {
    participants: ['alice', 'bob'],
    collegeId: 'dypiu',
    usersInfo: {},
    lastMessage: 'hello',
    updatedAt: '2026-01-01',
    unreadCount: {},
    typing: {},
  });

  await seedDoc('chats/chat-other', {
    participants: ['alice', 'other-college-user'],
    collegeId: 'other-college',
    usersInfo: {},
    lastMessage: '',
    updatedAt: '2026-01-01',
    unreadCount: {},
    typing: {},
  });

  await seedDoc('chats/chat-alice-bob/messages/message-1', {
    senderId: 'bob',
    text: 'hello',
    deleted: false,
  });

  await seedDoc('buzz_posts/post-dypiu', {
    authorId: 'alice',
    collegeId: 'dypiu',
    text: 'Campus post',
    likes: [],
    commentCount: 0,
    votes: {},
    createdAt: '2026-01-01',
  });

  await seedDoc('buzz_posts/post-other', {
    authorId: 'other-college-user',
    collegeId: 'other-college',
    text: 'Other post',
    likes: [],
    commentCount: 0,
    votes: {},
    createdAt: '2026-01-01',
  });

  await seedDoc('stories/story-dypiu', {
    userId: 'alice',
    collegeId: 'dypiu',
    text: 'Campus story',
    viewers: [],
    reactions: {},
    audience: ['alice', 'bob'],
  });

  await seedDoc('stories/story-other', {
    userId: 'other-college-user',
    collegeId: 'other-college',
    text: 'Other story',
    viewers: [],
    reactions: {},
  });

  await seedDoc('vaults/vault-dypiu', {
    collegeId: 'dypiu',
    createdBy: 'alice',
    members: ['alice', 'bob'],
    admins: ['alice'],
    name: 'CSE Vault',
  });

  await seedDoc('vaults/vault-private', {
    collegeId: 'dypiu',
    createdBy: 'alice',
    members: ['alice'],
    admins: ['alice'],
    name: 'Private Vault',
  });

  await seedDoc('vault_files/file-dypiu', {
    vaultId: 'vault-dypiu',
    uploader: { uid: 'alice' },
    name: 'notes.pdf',
    upvotes: [],
    status: 'pending',
  });
}

describe('WeConnect Firestore expanded security rules', { concurrency: false }, () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'weconnect-8fd01-expanded',
      firestore: {
        rules: RULES,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  test('verified DYPIU user can query users only with campus constraint', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      getDocs(query(collection(db, 'users'), where('collegeId', '==', 'dypiu')))
    );

    await assertFails(getDocs(query(collection(db, 'users'))));
  });

  test('cross-campus user cannot read a DYPIU user', async () => {
    await assertFails(getDoc(doc(dbAs('other-college-user'), 'users', 'alice')));
  });

  test('unverified user cannot read campus data', async () => {
    await assertFails(getDoc(doc(dbAs('alice', false), 'users', 'bob')));
    await assertFails(getDoc(doc(dbAs('alice', false), 'buzz_posts', 'post-dypiu')));
  });

  test('user cannot forge public emailVerified state while unverified', async () => {
    await assertFails(
      updateDoc(doc(dbAs('alice', false), 'users', 'alice'), {
        emailVerified: true,
      })
    );
  });

  test('user cannot change immutable identity fields', async () => {
    const db = dbAs('alice');

    await assertFails(updateDoc(doc(db, 'users', 'alice'), { uid: 'bob' }));
    await assertFails(
      updateDoc(doc(db, 'users', 'alice'), { collegeId: 'other-college' })
    );
    await assertFails(
      updateDoc(doc(db, 'users', 'alice'), { collegeName: 'Other College' })
    );
    await assertFails(
      updateDoc(doc(db, 'users', 'alice'), { createdAt: '2099-01-01' })
    );
  });

  test('private profile data is owner-only', async () => {
    await assertSucceeds(
      getDoc(doc(dbAs('alice'), 'userPrivate', 'alice'))
    );
    await assertFails(
      getDoc(doc(dbAs('bob'), 'userPrivate', 'alice'))
    );
  });

  test('private contact fields cannot be exposed through public profiles', async () => {
    const db = dbAs('alice');

    await assertFails(
      updateDoc(doc(db, 'users', 'alice'), { whatsapp: '9999999999' })
    );
    await assertFails(
      updateDoc(doc(db, 'users', 'alice'), { email: 'alice@example.com' })
    );

    await assertSucceeds(
      updateDoc(doc(db, 'userPrivate', 'alice'), { whatsapp: '9999999999' })
    );
    await assertFails(
      updateDoc(doc(db, 'userPrivate', 'alice'), { email: 'bob@example.com' })
    );
  });

  test('connection request participants can delete their own request during account cleanup', async () => {
    await seedDoc('connectionRequests/req-delete', {
      senderId: 'alice',
      receiverId: 'bob',
      status: 'pending',
      sender: { uid: 'alice' },
      receiver: { uid: 'bob' },
    });

    await assertSucceeds(
      deleteDoc(doc(dbAs('alice'), 'connectionRequests', 'req-delete'))
    );
  });

  test('only the receiver can accept or decline a pending connection request', async () => {
    await seedDoc('connectionRequests/req-1', {
      senderId: 'alice',
      receiverId: 'bob',
      status: 'pending',
      sender: { uid: 'alice' },
      receiver: { uid: 'bob' },
    });

    const bob = dbAs('bob');
    await assertSucceeds(
      updateDoc(doc(bob, 'connectionRequests', 'req-1'), {
        status: 'accepted',
        updatedAt: '2026-01-02',
      })
    );

    await seedDoc('connectionRequests/req-2', {
      senderId: 'alice',
      receiverId: 'bob',
      status: 'pending',
      sender: { uid: 'alice' },
      receiver: { uid: 'bob' },
    });

    await assertFails(
      updateDoc(doc(dbAs('alice'), 'connectionRequests', 'req-2'), {
        status: 'accepted',
        updatedAt: '2026-01-02',
      })
    );
  });

  test('connection request participants cannot rewrite sender or receiver IDs', async () => {
    await seedDoc('connectionRequests/req-immutable', {
      senderId: 'alice',
      receiverId: 'bob',
      status: 'pending',
      sender: { uid: 'alice' },
      receiver: { uid: 'bob' },
    });

    await assertFails(
      updateDoc(doc(dbAs('bob'), 'connectionRequests', 'req-immutable'), {
        senderId: 'bob',
        receiverId: 'alice',
        status: 'accepted',
      })
    );
  });


  test('same-campus student can join a vault when given its invite code', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('bob'), 'vaults', 'vault-dypiu'), {
        members: ['alice', 'bob']
      })
    );

    await assertFails(
      updateDoc(doc(dbAs('other-college-user'), 'vaults', 'vault-dypiu'), {
        members: ['alice', 'other-college-user']
      })
    );
  });

  test('campus constrained story and vault queries are allowed', async () => {
    const alice = dbAs('alice');

    await assertSucceeds(
      getDocs(query(
        collection(alice, 'stories'),
        where('collegeId', '==', 'dypiu'),
        where('audience', 'array-contains', 'alice')
      ))
    );

    await assertSucceeds(
      getDocs(query(
        collection(alice, 'vaults'),
        where('collegeId', '==', 'dypiu'),
        where('members', 'array-contains', 'alice')
      ))
    );
  });

  test('unconnected campus user cannot create a direct chat', async () => {
    const db = dbAs('alice');
    await assertFails(
      setDoc(doc(db, 'chats/chat-alice-other'), {
        participants: ['alice', 'other-college-user'],
        collegeId: 'dypiu',
        usersInfo: {},
        lastMessage: '',
        updatedAt: '2026-01-01',
        unreadCount: {},
        typing: {},
      })
    );
  });

  test('non-participant cannot update a chat', async () => {
    await assertFails(
      updateDoc(doc(dbAs('other-college-user'), 'chats', 'chat-alice-bob'), {
        lastMessage: 'tampered',
      })
    );
  });

  test('chat participant can send a message as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('alice'), 'chats/chat-alice-bob/messages', 'message-alice'), {
        senderId: 'alice',
        text: 'new message',
        deleted: false,
      })
    );
  });

  test('chat participant cannot send a message as another user', async () => {
    await assertFails(
      setDoc(doc(dbAs('alice'), 'chats/chat-alice-bob/messages', 'message-forged'), {
        senderId: 'bob',
        text: 'forged',
      })
    );
  });

  test('cross-campus chat is inaccessible', async () => {
    await assertFails(
      getDoc(doc(dbAs('alice'), 'chats', 'chat-other'))
    );
  });

  test('chat participants and campus cannot be tampered with', async () => {
    const db = dbAs('alice');

    await assertFails(
      updateDoc(doc(db, 'chats', 'chat-alice-bob'), {
        participants: ['alice', 'other-college-user'],
      })
    );

    await assertFails(
      updateDoc(doc(db, 'chats', 'chat-alice-bob'), {
        collegeId: 'other-college',
      })
    );
  });

  test('only message sender can change message content fields', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('bob'), 'chats/chat-alice-bob/messages', 'message-1'), {
        text: 'edited',
      })
    );

    await assertFails(
      updateDoc(doc(dbAs('alice'), 'chats/chat-alice-bob/messages', 'message-1'), {
        text: 'unauthorized edit',
      })
    );
  });

  test('campus-scoped story query succeeds and unconstrained query fails', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      getDocs(query(collection(db, 'stories'), where('audience', 'array-contains', 'alice')))
    );
    await assertFails(getDocs(query(collection(db, 'stories'))));
  });

  test('story owner can update and delete own story', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      updateDoc(doc(db, 'stories', 'story-dypiu'), { caption: 'updated' })
    );
    await assertSucceeds(deleteDoc(doc(db, 'stories', 'story-dypiu')));
  });

  test('user cannot modify another user story content', async () => {
    await assertFails(
      updateDoc(doc(dbAs('bob'), 'stories', 'story-dypiu'), {
        text: 'tampered',
      })
    );
  });

  test('campus-scoped update query succeeds and unconstrained query fails', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      getDocs(query(collection(db, 'buzz_posts'), where('collegeId', '==', 'dypiu')))
    );
    await assertFails(getDocs(query(collection(db, 'buzz_posts'))));
  });

  test('post owner can edit content but cannot change ownership or campus', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      updateDoc(doc(db, 'buzz_posts', 'post-dypiu'), { text: 'edited' })
    );

    await assertFails(
      updateDoc(doc(db, 'buzz_posts', 'post-dypiu'), { authorId: 'bob' })
    );
    await assertFails(
      updateDoc(doc(db, 'buzz_posts', 'post-dypiu'), { collegeId: 'other-college' })
    );
  });

  test('non-owner cannot edit post content', async () => {
    await assertFails(
      updateDoc(doc(dbAs('bob'), 'buzz_posts', 'post-dypiu'), {
        text: 'tampered',
      })
    );
  });

  test('vault member can read vault and non-member cannot', async () => {
    await assertSucceeds(
      getDoc(doc(dbAs('bob'), 'vaults', 'vault-dypiu'))
    );
    await assertFails(
      getDoc(doc(dbAs('other-college-user'), 'vaults', 'vault-dypiu'))
    );
  });

  test('vault member cannot arbitrarily rewrite vault identity fields', async () => {
    await assertFails(
      updateDoc(doc(dbAs('bob'), 'vaults', 'vault-dypiu'), {
        collegeId: 'other-college',
      })
    );
    await assertFails(
      updateDoc(doc(dbAs('bob'), 'vaults', 'vault-dypiu'), {
        createdBy: 'bob',
      })
    );
  });

  test('vault admin can manage vault while regular member is limited', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('alice'), 'vaults', 'vault-dypiu'), {
        name: 'Updated Vault',
      })
    );

    await assertFails(
      updateDoc(doc(dbAs('bob'), 'vaults', 'vault-dypiu'), {
        name: 'Member Rewrite',
      })
    );
  });

  test('vault file requires membership and uploader identity on create', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('bob'), 'vault_files', 'file-bob'), {
        vaultId: 'vault-dypiu',
        uploader: { uid: 'bob' },
        name: 'bob.pdf',
        upvotes: [],
        status: 'pending',
      })
    );

    await assertFails(
      setDoc(doc(dbAs('bob'), 'vault_files', 'file-forged'), {
        vaultId: 'vault-dypiu',
        uploader: { uid: 'alice' },
        name: 'forged.pdf',
        upvotes: [],
        status: 'pending',
      })
    );

    await assertFails(
      setDoc(doc(dbAs('other-college-user'), 'vault_files', 'file-other'), {
        vaultId: 'vault-dypiu',
        uploader: { uid: 'other-college-user' },
        name: 'other.pdf',
        upvotes: [],
        status: 'pending',
      })
    );
  });

  test('vault file uploader can rename but cannot move file to another vault', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      updateDoc(doc(db, 'vault_files', 'file-dypiu'), { name: 'renamed.pdf' })
    );

    await assertFails(
      updateDoc(doc(db, 'vault_files', 'file-dypiu'), {
        vaultId: 'vault-private',
      })
    );
  });

  test('verified user can delete their own profile but not another user profile', async () => {
    const aliceDb = dbAs('alice');
    const bobDb = dbAs('bob');

    await assertSucceeds(deleteDoc(doc(aliceDb, 'users', 'alice')));
    await assertFails(deleteDoc(doc(bobDb, 'users', 'alice')));
  });

  test('user can create and remove their own block, but cannot edit another block', async () => {
    const aliceDb = dbAs('alice');
    const bobDb = dbAs('bob');

    await assertSucceeds(
      setDoc(doc(aliceDb, 'blocks', 'alice_bob'), {
        blockerId: 'alice',
        blockedId: 'bob',
        createdAt: new Date(),
      })
    );

    await assertSucceeds(getDoc(doc(aliceDb, 'blocks', 'alice_bob')));
    await assertFails(getDoc(doc(bobDb, 'blocks', 'alice_bob')));
    await assertFails(
      updateDoc(doc(aliceDb, 'blocks', 'alice_bob'), { blockedId: 'charlie' })
    );
    await assertSucceeds(deleteDoc(doc(aliceDb, 'blocks', 'alice_bob')));
  });

  test('verified user can submit a report but reports are not readable or editable by users', async () => {
    const aliceDb = dbAs('alice');
    const bobDb = dbAs('bob');

    await assertSucceeds(
      setDoc(doc(aliceDb, 'reports', 'alice_report_1'), {
        reporterId: 'alice',
        targetId: 'bob',
        reason: 'Spam / scam',
        details: 'Test report',
        status: 'open',
        createdAt: new Date(),
      })
    );

    await assertFails(getDoc(doc(aliceDb, 'reports', 'alice_report_1')));
    await assertFails(getDoc(doc(bobDb, 'reports', 'alice_report_1')));
    await assertFails(
      updateDoc(doc(aliceDb, 'reports', 'alice_report_1'), { status: 'closed' })
    );
  });

  test('unknown collections remain denied by default', async () => {
    const db = dbAs('alice');

    await assertFails(
      getDoc(doc(db, 'totallyUnknownCollection', 'secret'))
    );
    await assertFails(
      setDoc(doc(db, 'totallyUnknownCollection', 'secret'), { value: true })
    );
  });
});
