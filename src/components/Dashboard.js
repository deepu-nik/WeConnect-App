import React, { useState, useRef } from 'react';
import { 
  View, Text, StyleSheet, Animated, TouchableOpacity, TextInput, 
  ScrollView, Dimensions, LayoutAnimation, Alert 
} from 'react-native';

import { 
  Calendar, CheckSquare, Receipt, BookOpen, AlarmClock, 
  X, Plus, Trash2, CheckCircle, Circle, Share2, Clock, Edit3, ChevronUp, Edit2
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.65; 
const CARD_SPACING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

const Dashboard = ({ onClose }) => {
  const [expandedCard, setExpandedCard] = useState(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // --- LIVE DATA STATES ---
  const [schedule, setSchedule] = useState([
    { id: '1', subject: 'Data Structures', time: '10:00 AM', room: 'Lab 2' }
  ]);
  const [scheduleInput, setScheduleInput] = useState({ subject: '', time: '', room: '' });

  const [todos, setTodos] = useState([
    { id: '1', text: 'Prep for SIH Hackathon', done: false },
    { id: '2', text: 'Pay mess fees', done: false }
  ]);
  const [todoInput, setTodoInput] = useState('');

  const [billAmount, setBillAmount] = useState('850');
  const [splitCount, setSplitCount] = useState('4');
  const [upiId, setUpiId] = useState('student@ybl');

  const [notes, setNotes] = useState([
    { id: '1', title: 'Sorting Algos', content: 'Merge Sort: O(n log n). Stable, divide and conquer. Bubble Sort: O(n^2).' }
  ]);
  const [noteInput, setNoteInput] = useState({ title: '', content: '' });

  const [alarms, setAlarms] = useState([{ id: '1', time: '07:30 AM', label: 'Morning Lecture', enabled: true }]);
  const [alarmInput, setAlarmInput] = useState({ time: '', label: '' });

  const cards = [
    { id: 'schedule', title: 'Schedule', icon: <Calendar size={24} color="#007AFF" />, color: '#E6F4FE' },
    { id: 'todo', title: 'To-Do', icon: <CheckSquare size={24} color="#34C759" />, color: '#E8F8F0' },
    { id: 'split', title: 'Split Bill', icon: <Receipt size={24} color="#FF9500" />, color: '#FFF4E5' },
    { id: 'notes', title: 'Notes', icon: <BookOpen size={24} color="#AF52DE" />, color: '#F4E8FA' },
    { id: 'alarm', title: 'Alarms', icon: <AlarmClock size={24} color="#FF3B30" />, color: '#FFEBEB' },
  ];

  const toggleCard = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCard(id);
  };

  const closeExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCard(null);
  };

  // --- EDIT HANDLERS ---
  const handleEditSchedule = (item) => {
    setScheduleInput({ subject: item.subject, time: item.time, room: item.room });
    setSchedule(schedule.filter(s => s.id !== item.id));
  };

  const handleEditTodo = (item) => {
    setTodoInput(item.text);
    setTodos(todos.filter(t => t.id !== item.id));
  };

  const handleEditNote = (item) => {
    setNoteInput({ title: item.title, content: item.content });
    setNotes(notes.filter(n => n.id !== item.id));
  };

  const handleEditAlarm = (item) => {
    setAlarmInput({ time: item.time, label: item.label });
    setAlarms(alarms.filter(a => a.id !== item.id));
  };

  // --- PREVIEW RENDERING ---
  const renderCardPreview = (id) => {
    switch (id) {
      case 'schedule':
        const nextClass = schedule[0];
        return nextClass ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewSub}>Next Class</Text>
            <Text style={styles.previewTitle} numberOfLines={2}>{nextClass.subject}</Text>
            <Text style={styles.previewDetail}>{nextClass.time} • {nextClass.room}</Text>
            {schedule.length > 1 && <Text style={styles.previewExtra}>+ {schedule.length - 1} more today</Text>}
          </View>
        ) : <Text style={styles.previewEmpty}>No upcoming classes.</Text>;
        
      case 'todo':
        const pending = todos.filter(t => !t.done);
        return pending.length > 0 ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewSub}>{pending.length} Tasks Pending</Text>
            {pending.slice(0, 3).map(t => (
              <View key={t.id} style={styles.previewTodoRow}>
                <Circle size={14} color="#888" />
                <Text style={styles.previewTodoText} numberOfLines={1}>{t.text}</Text>
              </View>
            ))}
            {pending.length > 3 && <Text style={styles.previewExtra}>+ {pending.length - 3} more</Text>}
          </View>
        ) : <Text style={styles.previewEmpty}>All caught up! 🎉</Text>;

      case 'split':
        return billAmount && splitCount ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewSub}>Current Bill</Text>
            <Text style={styles.previewTitle}>₹{billAmount}</Text>
            <Text style={styles.previewDetail}>Split between {splitCount}</Text>
            <View style={styles.previewHighlightBox}>
              <Text style={styles.previewHighlightText}>₹{(parseFloat(billAmount) / parseInt(splitCount)).toFixed(2)} each</Text>
            </View>
          </View>
        ) : <Text style={styles.previewEmpty}>No active bills.</Text>;

      case 'notes':
        const latestNote = notes[0];
        return latestNote ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewSub}>Latest Note</Text>
            <Text style={styles.previewTitle} numberOfLines={1}>{latestNote.title}</Text>
            <Text style={styles.previewDetailText} numberOfLines={4}>{latestNote.content}</Text>
          </View>
        ) : <Text style={styles.previewEmpty}>Tap to add a note.</Text>;

      case 'alarm':
        const activeAlarms = alarms.filter(a => a.enabled);
        return activeAlarms.length > 0 ? (
          <View style={styles.previewContainer}>
            <Text style={styles.previewSub}>Next Alarm</Text>
            <Text style={styles.previewTitle}>{activeAlarms[0].time}</Text>
            <Text style={styles.previewDetail}>{activeAlarms[0].label}</Text>
            {activeAlarms.length > 1 && <Text style={styles.previewExtra}>+ {activeAlarms.length - 1} more active</Text>}
          </View>
        ) : <Text style={styles.previewEmpty}>No active alarms.</Text>;

      default: return null;
    }
  };

  // --- EXPANDED EDITING VIEWS ---
  const renderExpandedContent = () => {
    switch (expandedCard) {
      case 'schedule':
        return (
          <View style={styles.expandedInner}>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Subject" value={scheduleInput.subject} onChangeText={t => setScheduleInput({...scheduleInput, subject: t})} />
              <TouchableOpacity style={styles.addBtn} onPress={() => { if(scheduleInput.subject){setSchedule([...schedule, { id: Date.now().toString(), ...scheduleInput }]); setScheduleInput({ subject: '', time: '', room: '' });} }}><Plus color="#fff" /></TouchableOpacity>
            </View>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="10:00 AM" value={scheduleInput.time} onChangeText={t => setScheduleInput({...scheduleInput, time: t})} />
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Room 402" value={scheduleInput.room} onChangeText={t => setScheduleInput({...scheduleInput, room: t})} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {schedule.map(item => (
                <View key={item.id} style={styles.listItem}>
                  <View style={{flex: 1}}><Text style={styles.itemTitle}>{item.subject}</Text><Text style={styles.itemSub}>{item.time} • {item.room}</Text></View>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => handleEditSchedule(item)}><Edit2 size={20} color="#007AFF" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setSchedule(schedule.filter(s => s.id !== item.id))}><Trash2 size={20} color="#FF3B30" /></TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        );
      case 'todo':
        return (
          <View style={styles.expandedInner}>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="New task..." value={todoInput} onChangeText={setTodoInput} />
              <TouchableOpacity style={styles.addBtn} onPress={() => { if(todoInput) { setTodos([{id: Date.now().toString(), text: todoInput, done: false}, ...todos]); setTodoInput(''); } }}><Plus color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {todos.map(todo => (
                <TouchableOpacity key={todo.id} style={styles.listItem} onPress={() => setTodos(todos.map(t => t.id === todo.id ? {...t, done: !t.done} : t))}>
                  {todo.done ? <CheckCircle size={24} color="#34C759" /> : <Circle size={24} color="#ccc" />}
                  <Text style={[styles.itemTitle, {flex: 1, marginLeft: 10}, todo.done && {textDecorationLine: 'line-through', color:'#888'}]}>{todo.text}</Text>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => handleEditTodo(todo)}><Edit2 size={20} color="#007AFF" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setTodos(todos.filter(t => t.id !== todo.id))}><Trash2 size={20} color="#FF3B30" /></TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      case 'split':
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.expandedInner}>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Total Bill (₹)" keyboardType="numeric" value={billAmount} onChangeText={setBillAmount} />
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Split By" keyboardType="numeric" value={splitCount} onChangeText={setSplitCount} />
            </View>
            <TextInput style={[styles.input, {marginBottom: 15}]} placeholder="Your UPI ID" autoCapitalize="none" value={upiId} onChangeText={setUpiId} />
            {billAmount && splitCount ? (
              <View style={styles.qrBox}>
                <Text style={styles.splitResult}>₹{(parseFloat(billAmount)/parseInt(splitCount)).toFixed(2)} / person</Text>
                <View style={styles.qrWrapper}><QRCode value={`upi://pay?pa=${upiId}&pn=Student&am=${(parseFloat(billAmount)/parseInt(splitCount)).toFixed(2)}&cu=INR`} size={130} /></View>
                <TouchableOpacity style={styles.shareBtn}><Share2 size={16} color="#fff" /><Text style={styles.shareText}>Share Link</Text></TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        );
      case 'notes':
        return (
          <View style={styles.expandedInner}>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Title" value={noteInput.title} onChangeText={t => setNoteInput({...noteInput, title: t})} />
              <TouchableOpacity style={styles.addBtn} onPress={() => { if(noteInput.title) { setNotes([{id: Date.now().toString(), ...noteInput}, ...notes]); setNoteInput({title:'', content:''}); } }}><Plus color="#fff" /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top', marginBottom: 15}]} multiline placeholder="Note content..." value={noteInput.content} onChangeText={t => setNoteInput({...noteInput, content: t})} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {notes.map(note => (
                <View key={note.id} style={styles.listItem}>
                  <View style={{flex: 1}}><Text style={styles.itemTitle}>{note.title}</Text><Text style={styles.itemSub}>{note.content}</Text></View>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => handleEditNote(note)}><Edit2 size={20} color="#007AFF" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setNotes(notes.filter(n => n.id !== note.id))}><Trash2 size={20} color="#FF3B30" /></TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        );
      case 'alarm':
        return (
          <View style={styles.expandedInner}>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, {flex: 1}]} placeholder="07:00 AM" value={alarmInput.time} onChangeText={t => setAlarmInput({...alarmInput, time: t})} />
              <TextInput style={[styles.input, {flex: 2, marginHorizontal: 10}]} placeholder="Label" value={alarmInput.label} onChangeText={t => setAlarmInput({...alarmInput, label: t})} />
              <TouchableOpacity style={[styles.addBtn, {width: 50}]} onPress={() => { if(alarmInput.time){ setAlarms([...alarms, {id: Date.now().toString(), time: alarmInput.time, label: alarmInput.label, enabled: true}]); setAlarmInput({time:'', label:''}); } }}><Plus color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {alarms.map(alarm => (
                <View key={alarm.id} style={[styles.listItem, !alarm.enabled && {opacity: 0.5}]}>
                  <Clock size={24} color={alarm.enabled ? "#FF3B30" : "#888"} />
                  <View style={{flex: 1, marginLeft: 10}}><Text style={styles.itemTitle}>{alarm.time}</Text><Text style={styles.itemSub}>{alarm.label}</Text></View>
                  <TouchableOpacity style={[styles.toggleBtn, {marginRight: 10}]} onPress={() => setAlarms(alarms.map(a => a.id === alarm.id ? {...a, enabled: !a.enabled} : a))}>
                    <Text style={{color: alarm.enabled ? '#34C759' : '#888', fontWeight: 'bold'}}>{alarm.enabled ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => handleEditAlarm(alarm)}><Edit2 size={20} color="#007AFF" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setAlarms(alarms.filter(a => a.id !== alarm.id))}><Trash2 size={20} color="#FF3B30" /></TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        );
      default: return null;
    }
  };

  const renderCard = ({ item, index }) => {
    const inputRange = [(index - 1) * CARD_WIDTH, index * CARD_WIDTH, (index + 1) * CARD_WIDTH];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.85, 1.05, 0.85], extrapolate: 'clamp' });
    const opacity = scrollX.interpolate({ inputRange, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp' });

    return (
      <Animated.View style={{ width: CARD_WIDTH, transform: [{ scale }], opacity, justifyContent: 'center' }}>
        <TouchableOpacity style={styles.proCard} activeOpacity={0.9} onPress={() => toggleCard(item.id)}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconSmallBox, { backgroundColor: item.color }]}>{item.icon}</View>
            <Text style={styles.cardTopTitle}>{item.title}</Text>
            <View style={{flex: 1}} />
            <Edit3 size={18} color="#888" />
          </View>
          <View style={styles.cardPreviewArea}>
            {renderCardPreview(item.id)}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Student Utilities</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeDashBtn}><ChevronUp size={24} color="#64748b" /></TouchableOpacity>
      </View>

      <View style={[styles.expandedWrapper, { display: expandedCard ? 'flex' : 'none' }]}>
        <View style={styles.expandedContainer}>
          <View style={styles.expandedHeader}>
            <Text style={styles.expandedTitle}>{cards.find(c => c.id === expandedCard)?.title}</Text>
            <TouchableOpacity onPress={closeExpanded} style={styles.closeExpandedBtn}><X size={20} color="#0f172a" /></TouchableOpacity>
          </View>
          {renderExpandedContent()}
        </View>
      </View>

      <View style={{ display: expandedCard ? 'none' : 'flex', flex: 1 }}>
        <Animated.FlatList 
          data={cards}
          keyExtractor={item => item.id}
          renderItem={renderCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH} 
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: CARD_SPACING, paddingVertical: 8, alignItems: 'center' }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 5, paddingBottom: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  closeDashBtn: { padding: 4, backgroundColor: '#e2e8f0', borderRadius: 20 },
  
  // Taller vertical cards squeezing out max space
  proCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, height: '94%', justifyContent: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconSmallBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardTopTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  
  // Previews
  cardPreviewArea: { flex: 1 },
  previewContainer: { flex: 1 },
  previewSub: { fontSize: 13, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  previewTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  previewDetail: { fontSize: 15, color: '#334155', fontWeight: '500', marginBottom: 4 },
  previewDetailText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  previewExtra: { fontSize: 13, color: '#94a3b8', marginTop: 10, fontStyle: 'italic' },
  previewEmpty: { fontSize: 15, color: '#94a3b8', fontStyle: 'italic', marginTop: 10 },
  previewTodoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  previewTodoText: { fontSize: 15, color: '#0f172a', marginLeft: 8, flex: 1 },
  previewHighlightBox: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 10, alignSelf: 'flex-start', marginTop: 10 },
  previewHighlightText: { color: '#007AFF', fontWeight: 'bold' },

  // Expanded Overlay UI
  expandedWrapper: { position: 'absolute', top: 40, left: 0, right: 0, bottom: 0, zIndex: 10 },
  expandedContainer: { flex: 1, marginHorizontal: 20, marginBottom: 15, backgroundColor: '#ffffff', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  expandedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  expandedTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  closeExpandedBtn: { padding: 5, backgroundColor: '#e2e8f0', borderRadius: 15 },
  expandedInner: { flex: 1, padding: 15 },

  // Shared Form Elements
  inputRow: { flexDirection: 'row', marginBottom: 15 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 15, height: 45, fontSize: 15, color: '#0f172a' },
  addBtn: { width: 45, height: 45, backgroundColor: '#007AFF', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  itemSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  actionIcon: { marginRight: 15 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e2e8f0', borderRadius: 12 },
  notifyBtn: { backgroundColor: '#e2e8f0', padding: 10, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  notifyText: { color: '#007AFF', fontWeight: 'bold' },
  qrBox: { alignItems: 'center', padding: 15, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  splitResult: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  qrWrapper: { padding: 10, backgroundColor: '#fff', borderRadius: 12, marginBottom: 15 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  shareText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
});

export default Dashboard;