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
} = require('firebase/firestore');
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
    connections: [],
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
    connections: [],
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

async function seed() {
  const admin = testEnv.withSecurityRulesDisabled((context) => context.firestore());

  await Promise.all(
    Object.values(USERS).map((user) =>
      setDoc(doc(admin, 'users', user.uid), user)
    )
  );

  await setDoc(doc(admin, 'userPrivate', 'alice'), {
    email: 'alice@example.com',
  });
  await setDoc(doc(admin, 'userPrivate', 'bob'), {
    email: 'bob@example.com',
  });

  await setDoc(doc(admin, 'chats', 'chat-alice-bob'), {
    participants: ['alice', 'bob'],
    collegeId: 'dypiu',
    usersInfo: {},
    lastMessage: 'hello',
    updatedAt: '2026-01-01',
    unreadCount: {},
    typing: {},
  });

  await setDoc(doc(admin, 'chats', 'chat-other'), {
    participants: ['alice', 'other-college-user'],
    collegeId: 'other-college',
    usersInfo: {},
    lastMessage: '',
    updatedAt: '2026-01-01',
    unreadCount: {},
    typing: {},
  });

  await setDoc(doc(admin, 'chats/chat-alice-bob/messages', 'message-1'), {
    senderId: 'bob',
    text: 'hello',
    deleted: false,
  });

  await setDoc(doc(admin, 'buzz_posts', 'post-dypiu'), {
    authorId: 'alice',
    collegeId: 'dypiu',
    text: 'Campus post',
    likes: [],
    commentCount: 0,
    votes: {},
    createdAt: '2026-01-01',
  });

  await setDoc(doc(admin, 'buzz_posts', 'post-other'), {
    authorId: 'other-college-user',
    collegeId: 'other-college',
    text: 'Other post',
    likes: [],
    commentCount: 0,
    votes: {},
    createdAt: '2026-01-01',
  });

  await setDoc(doc(admin, 'stories', 'story-dypiu'), {
    userId: 'alice',
    collegeId: 'dypiu',
    text: 'Campus story',
    viewers: [],
    reactions: {},
  });

  await setDoc(doc(admin, 'stories', 'story-other'), {
    userId: 'other-college-user',
    collegeId: 'other-college',
    text: 'Other story',
    viewers: [],
    reactions: {},
  });

  await setDoc(doc(admin, 'vaults', 'vault-dypiu'), {
    collegeId: 'dypiu',
    createdBy: 'alice',
    members: ['alice', 'bob'],
    admins: ['alice'],
    name: 'CSE Vault',
  });

  await setDoc(doc(admin, 'vaults', 'vault-private'), {
    collegeId: 'dypiu',
    createdBy: 'alice',
    members: ['alice'],
    admins: ['alice'],
    name: 'Private Vault',
  });

  await setDoc(doc(admin, 'vault_files', 'file-dypiu'), {
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

  test('only the receiver can accept or decline a pending connection request', async () => {
    const admin = testEnv.withSecurityRulesDisabled((context) => context.firestore());
    await setDoc(doc(admin, 'connectionRequests', 'req-1'), {
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

    await setDoc(doc(admin, 'connectionRequests', 'req-2'), {
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
    const admin = testEnv.unauthenticatedContext().firestore();
    await setDoc(doc(admin, 'connectionRequests', 'req-immutable'), {
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
      getDocs(query(collection(db, 'stories'), where('collegeId', '==', 'dypiu')))
    );
    await assertFails(getDocs(query(collection(db, 'stories'))));
  });

  test('story owner can update and delete own story', async () => {
    const db = dbAs('alice');

    await assertSucceeds(
      updateDoc(doc(db, 'stories', 'story-dypiu'), { text: 'updated' })
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
