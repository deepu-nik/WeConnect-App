import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  IndianRupee,
  ListTodo,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react-native';

const STORAGE_KEY = '@weconnect/student_hub_v1';

const DEFAULT_DATA = {
  tasks: [
    { id: 'task-1', title: 'Plan this week', done: false },
    { id: 'task-2', title: 'Review pending college work', done: false },
  ],
  notes: [],
  classes: [],
  expenses: [],
};

const moduleMeta = {
  schedule: { title: 'Class Schedule', icon: CalendarDays, description: 'Keep your classes and rooms in one place.' },
  tasks: { title: 'Tasks', icon: ListTodo, description: 'Track assignments, projects and small tasks.' },
  notes: { title: 'Notes', icon: StickyNote, description: 'Save quick study notes without leaving WeConnect.' },
  expenses: { title: 'Split Expenses', icon: IndianRupee, description: 'Calculate a simple per-person split.' },
};

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
};

const StudentHubScreen = ({ navigation }) => {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState(null);
  const [taskInput, setTaskInput] = useState('');
  const [noteInput, setNoteInput] = useState({ title: '', body: '' });
  const [classInput, setClassInput] = useState({ subject: '', time: '', room: '' });
  const [expenseInput, setExpenseInput] = useState({ amount: '', people: '2' });

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (mounted && stored) setData(safeJson(stored, DEFAULT_DATA));
      })
      .catch((error) => console.error('Student Hub load failed:', error))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((error) => {
      console.error('Student Hub save failed:', error);
    });
  }, [data, loading]);

  const pendingTasks = useMemo(() => data.tasks.filter((task) => !task.done), [data.tasks]);
  const nextClass = data.classes[0];
  const latestNote = data.notes[0];

  const addTask = () => {
    const title = taskInput.trim();
    if (!title) return;
    setData((current) => ({
      ...current,
      tasks: [{ id: String(Date.now()), title, done: false }, ...current.tasks],
    }));
    setTaskInput('');
  };

  const addNote = () => {
    const title = noteInput.title.trim();
    const body = noteInput.body.trim();
    if (!title && !body) return;
    setData((current) => ({
      ...current,
      notes: [{ id: String(Date.now()), title: title || 'Untitled note', body }, ...current.notes],
    }));
    setNoteInput({ title: '', body: '' });
  };

  const addClass = () => {
    const subject = classInput.subject.trim();
    if (!subject) return;
    setData((current) => ({
      ...current,
      classes: [...current.classes, { id: String(Date.now()), ...classInput, subject }],
    }));
    setClassInput({ subject: '', time: '', room: '' });
  };

  const toggleTask = (id) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task),
    }));
  };

  const removeItem = (key, id) => {
    setData((current) => ({ ...current, [key]: current[key].filter((item) => item.id !== id) }));
  };

  const splitAmount = Number(expenseInput.amount);
  const splitPeople = Math.max(1, Number(expenseInput.people) || 1);
  const perPerson = Number.isFinite(splitAmount) && splitAmount > 0 ? splitAmount / splitPeople : 0;

  const renderModuleContent = () => {
    if (activeModule === 'tasks') {
      return (
        <View style={styles.modalContent}>
          <Text style={styles.modalEyebrow}>TASKS</Text>
          <Text style={styles.modalTitle}>What needs to get done?</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={taskInput}
              onChangeText={setTaskInput}
              placeholder="e.g. Finish DBMS assignment"
              placeholderTextColor="#999990"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={addTask}
            />
            <TouchableOpacity style={styles.addButton} onPress={addTask}>
              <Plus size={20} color="#111111" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent} keyboardShouldPersistTaps="handled">
            {data.tasks.map((task) => (
              <View key={task.id} style={styles.listRow}>
                <TouchableOpacity onPress={() => toggleTask(task.id)} style={styles.checkButton}>
                  {task.done ? <CheckCircle2 size={22} color="#111111" /> : <Circle size={22} color="#B8B8B0" />}
                </TouchableOpacity>
                <Text style={[styles.listText, task.done && styles.listTextDone]}>{task.title}</Text>
                <TouchableOpacity onPress={() => removeItem('tasks', task.id)}>
                  <Trash2 size={17} color="#999990" />
                </TouchableOpacity>
              </View>
            ))}
            {!data.tasks.length ? <EmptyState text="No tasks yet." /> : null}
          </ScrollView>
        </View>
      );
    }

    if (activeModule === 'notes') {
      return (
        <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.modalEyebrow}>NOTES</Text>
          <Text style={styles.modalTitle}>Capture something useful.</Text>
          <TextInput value={noteInput.title} onChangeText={(title) => setNoteInput((current) => ({ ...current, title }))} placeholder="Note title" placeholderTextColor="#999990" style={styles.inputFull} />
          <TextInput value={noteInput.body} onChangeText={(body) => setNoteInput((current) => ({ ...current, body }))} placeholder="Write your note..." placeholderTextColor="#999990" style={[styles.inputFull, styles.noteInput]} multiline textAlignVertical="top" />
          <TouchableOpacity style={styles.primaryButton} onPress={addNote}>
            <Plus size={18} color="#111111" />
            <Text style={styles.primaryButtonText}>Save note</Text>
          </TouchableOpacity>
          <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
            {data.notes.map((note) => (
              <View key={note.id} style={styles.noteRow}>
                <View style={styles.noteCopy}>
                  <Text style={styles.noteTitle}>{note.title}</Text>
                  <Text style={styles.noteBody} numberOfLines={3}>{note.body || 'No content'}</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem('notes', note.id)}>
                  <Trash2 size={17} color="#999990" />
                </TouchableOpacity>
              </View>
            ))}
            {!data.notes.length ? <EmptyState text="Your saved notes will appear here." /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }

    if (activeModule === 'schedule') {
      return (
        <View style={styles.modalContent}>
          <Text style={styles.modalEyebrow}>SCHEDULE</Text>
          <Text style={styles.modalTitle}>Plan your classes.</Text>
          <View style={styles.inputRow}>
            <TextInput value={classInput.subject} onChangeText={(subject) => setClassInput((current) => ({ ...current, subject }))} placeholder="Subject" placeholderTextColor="#999990" style={styles.input} />
            <TouchableOpacity style={styles.addButton} onPress={addClass}>
              <Plus size={20} color="#111111" />
            </TouchableOpacity>
          </View>
          <View style={styles.twoInputs}>
            <TextInput value={classInput.time} onChangeText={(time) => setClassInput((current) => ({ ...current, time }))} placeholder="Time" placeholderTextColor="#999990" style={[styles.inputFull, styles.halfInput]} />
            <TextInput value={classInput.room} onChangeText={(room) => setClassInput((current) => ({ ...current, room }))} placeholder="Room" placeholderTextColor="#999990" style={[styles.inputFull, styles.halfInput]} />
          </View>
          <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
            {data.classes.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View style={styles.scheduleIcon}><CalendarDays size={18} color="#111111" /></View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listText}>{item.subject}</Text>
                  <Text style={styles.listMeta}>{item.time || 'Time not set'}{item.room ? ' • ' + item.room : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem('classes', item.id)}>
                  <Trash2 size={17} color="#999990" />
                </TouchableOpacity>
              </View>
            ))}
            {!data.classes.length ? <EmptyState text="No classes added yet." /> : null}
          </ScrollView>
        </View>
      );
    }

    if (activeModule === 'expenses') {
      return (
        <View style={styles.modalContent}>
          <Text style={styles.modalEyebrow}>SPLIT EXPENSES</Text>
          <Text style={styles.modalTitle}>How much does everyone owe?</Text>
          <TextInput value={expenseInput.amount} onChangeText={(amount) => setExpenseInput((current) => ({ ...current, amount }))} placeholder="Total amount (₹)" placeholderTextColor="#999990" style={styles.inputFull} keyboardType="decimal-pad" />
          <TextInput value={expenseInput.people} onChangeText={(people) => setExpenseInput((current) => ({ ...current, people }))} placeholder="Number of people" placeholderTextColor="#999990" style={styles.inputFull} keyboardType="number-pad" />
          <View style={styles.expenseResult}>
            <Text style={styles.resultLabel}>EACH PERSON</Text>
            <Text style={styles.resultAmount}>₹{perPerson.toFixed(2)}</Text>
            <Text style={styles.resultMeta}>{splitPeople} people • equal split</Text>
          </View>
        </View>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}><ActivityIndicator size="small" color="#111111" /><Text style={styles.loadingText}>Loading Student Hub…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#111111" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>WECONNECT</Text>
          <Text style={styles.headerTitle}>Student Hub</Text>
        </View>
        <View style={styles.headerBadge}><BookOpen size={17} color="#111111" /></View>
      </View>

      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>YOUR CAMPUS COMMAND CENTER</Text></View>
          <Text style={styles.heroTitle}>Stay on top of college.</Text>
          <Text style={styles.heroSubtitle}>A lightweight space for classes, tasks, notes and everyday student utilities.</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statValue}>{pendingTasks.length}</Text><Text style={styles.statLabel}>Pending tasks</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{data.classes.length}</Text><Text style={styles.statLabel}>Classes added</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{data.notes.length}</Text><Text style={styles.statLabel}>Saved notes</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Student tools</Text>
        <View style={styles.grid}>
          {Object.entries(moduleMeta).map(([id, meta]) => {
            const Icon = meta.icon;
            return (
              <TouchableOpacity key={id} style={styles.moduleCard} activeOpacity={0.84} onPress={() => setActiveModule(id)}>
                <View style={styles.moduleIcon}><Icon size={21} color="#111111" /></View>
                <Text style={styles.moduleTitle}>{meta.title}</Text>
                <Text style={styles.moduleDescription}>{meta.description}</Text>
                <View style={styles.moduleFooter}><Text style={styles.openText}>Open</Text><ChevronRight size={16} color="#111111" /></View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>At a glance</Text>
        <View style={styles.glanceCard}>
          <View style={styles.glanceRow}>
            <View style={styles.glanceIcon}><CalendarDays size={18} color="#111111" /></View>
            <View style={styles.glanceCopy}><Text style={styles.glanceLabel}>Next class</Text><Text style={styles.glanceValue}>{nextClass?.subject || 'Nothing scheduled yet'}</Text><Text style={styles.glanceMeta}>{nextClass ? [nextClass.time, nextClass.room].filter(Boolean).join(' • ') : 'Add your classes to see them here.'}</Text></View>
          </View>
          <View style={styles.divider} />
          <View style={styles.glanceRow}>
            <View style={styles.glanceIcon}><ListTodo size={18} color="#111111" /></View>
            <View style={styles.glanceCopy}><Text style={styles.glanceLabel}>Priority</Text><Text style={styles.glanceValue}>{pendingTasks[0]?.title || 'You are all caught up'}</Text><Text style={styles.glanceMeta}>{pendingTasks.length ? pendingTasks.length + ' task' + (pendingTasks.length === 1 ? '' : 's') + ' pending' : 'Nice work. Keep the momentum going.'}</Text></View>
          </View>
          <View style={styles.divider} />
          <View style={styles.glanceRow}>
            <View style={styles.glanceIcon}><StickyNote size={18} color="#111111" /></View>
            <View style={styles.glanceCopy}><Text style={styles.glanceLabel}>Latest note</Text><Text style={styles.glanceValue}>{latestNote?.title || 'No notes yet'}</Text><Text style={styles.glanceMeta}>{latestNote?.body || 'Save a quick study note from the Notes tool.'}</Text></View>
          </View>
        </View>

        <View style={styles.futureCard}>
          <Text style={styles.futureEyebrow}>COMING NEXT</Text>
          <Text style={styles.futureTitle}>More campus-native tools.</Text>
          <Text style={styles.futureText}>The Student Hub foundation is now ready for deeper features such as attendance, assignments, events, resources and campus announcements.</Text>
        </View>
        <View style={{ height: 35 }} />
      </ScrollView>

      <Modal visible={Boolean(activeModule)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModule(null)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }} />
            <Text style={styles.modalHeaderTitle}>{activeModule ? moduleMeta[activeModule].title : ''}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity style={styles.modalClose} onPress={() => setActiveModule(null)}>
                <X size={19} color="#111111" />
              </TouchableOpacity>
            </View>
          </View>
          {renderModuleContent()}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const EmptyState = ({ text }) => (
  <View style={styles.emptyState}><Check size={18} color="#999990" /><Text style={styles.emptyText}>{text}</Text></View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F2' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: '#777770', fontSize: 12 },
  header: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  iconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingHorizontal: 12 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#8B8B84' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#111111', marginTop: 1 },
  headerBadge: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16 },
  hero: { backgroundColor: '#111111', borderRadius: 24, padding: 20, marginBottom: 12 },
  heroBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFC00', marginBottom: 13 },
  heroBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9, color: '#111111' },
  heroTitle: { fontSize: 28, lineHeight: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },
  heroSubtitle: { fontSize: 12.5, lineHeight: 19, color: '#D2D2CC', marginTop: 8, maxWidth: 330 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 25 },
  statCard: { flex: 1, minHeight: 76, borderRadius: 18, padding: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF' },
  statValue: { fontSize: 22, fontWeight: '900', color: '#111111' },
  statLabel: { fontSize: 10, color: '#777770', marginTop: 4, lineHeight: 13 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#111111', marginBottom: 10, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 24 },
  moduleCard: { width: '48.5%', minHeight: 176, borderRadius: 20, padding: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF' },
  moduleIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  moduleTitle: { fontSize: 14, fontWeight: '900', color: '#111111' },
  moduleDescription: { fontSize: 10.5, lineHeight: 15, color: '#777770', marginTop: 5 },
  moduleFooter: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openText: { fontSize: 10, fontWeight: '900', color: '#111111' },
  glanceCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E5E5DF', paddingHorizontal: 14, marginBottom: 12 },
  glanceRow: { flexDirection: 'row', paddingVertical: 15, alignItems: 'center' },
  glanceIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  glanceCopy: { flex: 1, minWidth: 0 },
  glanceLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.9, color: '#999990' },
  glanceValue: { fontSize: 13, fontWeight: '900', color: '#22221F', marginTop: 2 },
  glanceMeta: { fontSize: 10.5, color: '#777770', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEEEEA' },
  futureCard: { backgroundColor: '#FFFEE6', borderRadius: 20, borderWidth: 1, borderColor: '#E8E5A8', padding: 16 },
  futureEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#8A8725' },
  futureTitle: { fontSize: 15, fontWeight: '900', color: '#111111', marginTop: 4 },
  futureText: { fontSize: 11, lineHeight: 17, color: '#666550', marginTop: 5 },
  modalContainer: { flex: 1, backgroundColor: '#F6F6F2' },
  modalHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  modalHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#111111' },
  modalClose: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  modalContent: { flex: 1, padding: 16 },
  modalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#8B8B84', marginTop: 4 },
  modalTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900', color: '#111111', marginTop: 4, marginBottom: 15 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 9 },
  input: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4DE', paddingHorizontal: 13, color: '#111111', fontSize: 13 },
  inputFull: { minHeight: 48, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4DE', paddingHorizontal: 13, color: '#111111', fontSize: 13, marginBottom: 9 },
  addButton: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  modalList: { flex: 1, marginTop: 8 },
  modalListContent: { paddingBottom: 25 },
  listRow: { minHeight: 60, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF', flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  checkButton: { width: 32, alignItems: 'center' },
  listTextWrap: { flex: 1, minWidth: 0, paddingHorizontal: 9 },
  listText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#22221F', paddingHorizontal: 8 },
  listTextDone: { textDecorationLine: 'line-through', color: '#999990' },
  listMeta: { fontSize: 10.5, color: '#777770', marginTop: 3 },
  scheduleIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  noteRow: { borderRadius: 16, padding: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF', flexDirection: 'row', marginBottom: 8 },
  noteCopy: { flex: 1, paddingRight: 8 },
  noteTitle: { fontSize: 13, fontWeight: '900', color: '#22221F' },
  noteBody: { fontSize: 11, lineHeight: 16, color: '#777770', marginTop: 4 },
  noteInput: { minHeight: 110, paddingTop: 12 },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#FFFC00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 5 },
  primaryButtonText: { fontSize: 13, fontWeight: '900', color: '#111111' },
  twoInputs: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  expenseResult: { marginTop: 10, borderRadius: 20, padding: 22, backgroundColor: '#111111', alignItems: 'center' },
  resultLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#BEBEB7' },
  resultAmount: { fontSize: 38, fontWeight: '900', color: '#FFFFFF', marginTop: 3 },
  resultMeta: { fontSize: 11, color: '#D2D2CC', marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 35, gap: 7 },
  emptyText: { fontSize: 11, color: '#999990' },
});

export default StudentHubScreen;
