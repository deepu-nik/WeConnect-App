import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, MoreVertical, Send, Shield, UserPlus, Users, X } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { addGroupMembers, deleteGroupMessage, getGroup, leaveGroup, removeGroupMember, sendGroupMessage, subscribeToGroupMessages, updateGroup } from '../services/groupService';

const FALLBACK = 'https://via.placeholder.com/100';

const timeLabel = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function GroupChatScreen({ route, navigation }) {
  const groupId = route?.params?.groupId;
  const uid = auth.currentUser?.uid;
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState([]);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    let active = true;
    const unsubscribeGroup = subscribeToGroup(groupId, (next) => {
      if (!active) return;
      if (!next) {
        Alert.alert('Group unavailable', 'This group no longer exists.');
        navigation.goBack();
        return;
      }
      setGroup(next);
      setLoading(false);
    }, (error) => {
      console.error('Group subscription failed:', error);
      if (active) setLoading(false);
    });
    const unsubscribeMessages = subscribeToGroupMessages(groupId, setMessages, (error) => console.error('Group messages failed:', error));
    getGroup(groupId).then((initial) => {
      if (active && initial) setGroup(initial);
      if (active && !initial) setLoading(false);
    }).catch(() => {});
    return () => { active = false; unsubscribeGroup?.(); unsubscribeMessages?.(); };
  }, [groupId]);

  const isAdmin = Boolean(group?.admins?.includes(uid));

  const loadConnections = async () => {
    try {
      const me = await getUserProfile(uid);
      const ids = Array.isArray(me?.connections) ? me.connections.filter((id) => !group?.members?.includes(id)) : [];
      const profiles = await Promise.all(ids.map((id) => getUserProfile(id).catch(() => null)));
      setConnections(profiles.filter(Boolean));
      setSelected([]);
      setAddVisible(true);
    } catch (error) {
      Alert.alert('Could not load connections', error?.message || 'Please try again.');
    }
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const value = text;
    setText('');
    try { await sendGroupMessage({ groupId, text: value }); }
    catch (error) { setText(value); Alert.alert('Message failed', error?.message || 'Please try again.'); }
    finally { setSending(false); }
  };

  const leave = async () => {
    Alert.alert('Leave group?', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await leaveGroup(groupId); navigation.goBack(); } catch (error) { Alert.alert('Cannot leave', error?.message || 'Please try again.'); }
      }},
    ]);
  };

  const saveName = () => {
    setRenameText(group.name || '');
    setRenameVisible(true);
  };

  const submitRename = async () => {
    const value = renameText.trim();
    if (!value) return Alert.alert('Group name required', 'Enter a group name.');
    try {
      await updateGroup(groupId, { name: value });
      setRenameVisible(false);
    } catch (error) {
      Alert.alert('Could not rename', error?.message || 'Please try again.');
    }
  };

  const addSelected = async () => {
    const users = connections.filter((person) => selected.includes(person.uid));
    try { await addGroupMembers(groupId, users); setAddVisible(false); setSelected([]); }
    catch (error) { Alert.alert('Could not add members', error?.message || 'Please try again.'); }
  };

  const renderMessage = ({ item }) => {
    const mine = item.senderId === uid;
    const sender = group?.memberProfiles?.[item.senderId] || { name: 'Student', avatar: FALLBACK };
    return (
      <TouchableOpacity
        style={[styles.messageRow, mine && styles.messageRowMine]}
        onLongPress={() => mine && Alert.alert('Message', 'Choose an action', [
          { text: 'Delete', style: 'destructive', onPress: () => deleteGroupMessage(groupId, item.id).catch(() => {}) },
          { text: 'Cancel', style: 'cancel' },
        ])}
        activeOpacity={0.92}
      >
        {!mine ? <Image source={{ uri: sender.avatar || FALLBACK }} style={styles.messageAvatar} /> : null}
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine ? <Text style={styles.sender}>{sender.name}</Text> : null}
          <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.deleted ? 'Message deleted' : item.text}</Text>
          <Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading || !group) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#111111" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}><ArrowLeft size={21} color="#111111" /></TouchableOpacity>
        <View style={styles.headerIdentity}>
          <View style={styles.groupAvatar}><Users size={19} color="#111111" /></View>
          <View style={{ flex: 1 }}><Text style={styles.groupName} numberOfLines={1}>{group.name}</Text><Text style={styles.groupMeta}>{group.members.length} members</Text></View>
        </View>
        <TouchableOpacity onPress={() => setInfoVisible(true)} style={styles.headerButton}><MoreVertical size={21} color="#111111" /></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.empty}><Users size={35} color="#B4B4AC" /><Text style={styles.emptyTitle}>Start the group</Text><Text style={styles.emptyText}>Say hello to everyone.</Text></View>}
        />
        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} placeholder="Message the group…" placeholderTextColor="#8A8A84" style={styles.input} multiline maxLength={2000} />
          <TouchableOpacity style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]} onPress={send} disabled={!text.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#111111" /> : <Send size={19} color="#111111" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={infoVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setInfoVisible(false)}>
        <SafeAreaView style={styles.infoModal}>
          <View style={styles.infoHeader}><View><Text style={styles.eyebrow}>GROUP</Text><Text style={styles.infoTitle}>{group.name}</Text></View><TouchableOpacity onPress={() => setInfoVisible(false)}><X size={22} color="#111111" /></TouchableOpacity></View>
          {group.description ? <Text style={styles.description}>{group.description}</Text> : null}
          <View style={styles.infoActions}>
            {isAdmin ? <TouchableOpacity style={styles.infoAction} onPress={loadConnections}><UserPlus size={17} color="#111111" /><Text style={styles.infoActionText}>Add members</Text></TouchableOpacity> : null}
            {isAdmin ? <TouchableOpacity style={styles.infoAction} onPress={saveName}><Text style={styles.renameIcon}>Aa</Text><Text style={styles.infoActionText}>Rename</Text></TouchableOpacity> : null}
            <TouchableOpacity style={[styles.infoAction, styles.leaveAction]} onPress={leave}><Text style={styles.leaveText}>Leave group</Text></TouchableOpacity>
          </View>
          <Text style={styles.membersTitle}>Members · {group.members.length}</Text>
          <FlatList
            data={group.members}
            keyExtractor={(id) => id}
            contentContainerStyle={{ paddingBottom: 30 }}
            renderItem={({ item: memberId }) => {
              const person = group.memberProfiles?.[memberId] || { name: 'Student', avatar: FALLBACK };
              const admin = group.admins.includes(memberId);
              return <View style={styles.memberRow}>
                <Image source={{ uri: person.avatar || FALLBACK }} style={styles.memberAvatar} />
                <View style={{ flex: 1 }}><Text style={styles.memberName}>{person.name}</Text><Text style={styles.memberMeta}>{memberId === group.createdBy ? 'Creator' : admin ? 'Admin' : 'Member'}</Text></View>
                {isAdmin && memberId !== group.createdBy && memberId !== uid ? <TouchableOpacity onPress={() => Alert.alert('Remove member?', person.name + ' will leave this group.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeGroupMember(groupId, memberId).catch((e) => Alert.alert('Could not remove', e.message)) }])}><Text style={styles.removeText}>Remove</Text></TouchableOpacity> : null}
              </View>;
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.renameOverlay}>
          <View style={styles.renameCard}>
            <View style={styles.infoHeader}><Text style={styles.infoTitle}>Rename group</Text><TouchableOpacity onPress={() => setRenameVisible(false)}><X size={22} color="#111111" /></TouchableOpacity></View>
            <TextInput value={renameText} onChangeText={setRenameText} placeholder="Group name" placeholderTextColor="#999999" style={styles.renameInput} maxLength={50} autoFocus />
            <TouchableOpacity style={styles.addButton} onPress={submitRename}><Text style={styles.addButtonText}>Save name</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={addVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddVisible(false)}>
        <SafeAreaView style={styles.infoModal}>
          <View style={styles.infoHeader}><Text style={styles.infoTitle}>Add members</Text><TouchableOpacity onPress={() => setAddVisible(false)}><X size={22} color="#111111" /></TouchableOpacity></View>
          <FlatList
            data={connections}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const active = selected.includes(item.uid);
              return <TouchableOpacity style={[styles.memberRow, active && styles.memberSelected]} onPress={() => setSelected((current) => active ? current.filter((id) => id !== item.uid) : [...current, item.uid])}>
                <Image source={{ uri: item.avatar || FALLBACK }} style={styles.memberAvatar} />
                <View style={{ flex: 1 }}><Text style={styles.memberName}>{item.name || 'Student'}</Text><Text style={styles.memberMeta}>{item.handle || 'Connection'}</Text></View>
                <View style={[styles.check, active && styles.checkActive]}>{active ? <Text style={{ fontWeight: '900' }}>✓</Text> : null}</View>
              </TouchableOpacity>;
            }}
          />
          <TouchableOpacity style={styles.addButton} onPress={addSelected} disabled={!selected.length}><Text style={styles.addButtonText}>Add {selected.length || ''} members</Text></TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
 container:{flex:1,backgroundColor:'#F6F6F2'},loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#F6F6F2'},
 header:{minHeight:68,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFFFFF',borderBottomWidth:1,borderBottomColor:'#E4E4DE'},
 headerButton:{width:40,height:40,borderRadius:13,backgroundColor:'#F0F0EB',alignItems:'center',justifyContent:'center'},headerIdentity:{flex:1,flexDirection:'row',alignItems:'center',gap:9},
 groupAvatar:{width:42,height:42,borderRadius:14,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},groupName:{fontSize:16,fontWeight:'900',color:'#111111'},groupMeta:{fontSize:10.5,color:'#777770',marginTop:2},
 messages:{paddingHorizontal:12,paddingVertical:16},messageRow:{flexDirection:'row',alignItems:'flex-end',marginBottom:9},messageRowMine:{justifyContent:'flex-end'},messageAvatar:{width:28,height:28,borderRadius:14,marginRight:6},bubble:{maxWidth:'80%',paddingHorizontal:12,paddingVertical:8,borderRadius:16},bubbleMine:{backgroundColor:'#111111',borderBottomRightRadius:5},bubbleOther:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E4E4DE',borderBottomLeftRadius:5},sender:{fontSize:10,fontWeight:'900',color:'#66665F',marginBottom:3},messageText:{fontSize:14,color:'#22221F',lineHeight:19},messageTextMine:{color:'#FFFFFF'},time:{fontSize:8,color:'#999990',marginTop:3,textAlign:'right'},timeMine:{color:'#BDBDB7'},
 composer:{paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'flex-end',gap:7,backgroundColor:'#FFFFFF',borderTopWidth:1,borderTopColor:'#E4E4DE'},input:{flex:1,maxHeight:110,minHeight:43,borderRadius:16,backgroundColor:'#F0F0EB',paddingHorizontal:13,paddingTop:11,paddingBottom:9,color:'#111111',fontSize:14},sendButton:{width:43,height:43,borderRadius:15,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},sendButtonDisabled:{opacity:0.45},
 empty:{padding:40,alignItems:'center'},emptyTitle:{fontSize:18,fontWeight:'900',color:'#111111',marginTop:9},emptyText:{fontSize:12,color:'#777770',marginTop:4},
 renameOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'center',padding:20},renameCard:{backgroundColor:'#FFFFFF',borderRadius:22,overflow:'hidden'},renameInput:{margin:16,minHeight:50,borderWidth:1,borderColor:'#E4E4DE',borderRadius:14,paddingHorizontal:13,color:'#111111'},infoModal:{flex:1,backgroundColor:'#F6F6F2'},infoHeader:{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#FFFFFF',borderBottomWidth:1,borderBottomColor:'#E4E4DE'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#8A8A84'},infoTitle:{fontSize:21,fontWeight:'900',color:'#111111',marginTop:2},description:{paddingHorizontal:16,paddingVertical:12,fontSize:12,color:'#66665F',lineHeight:18},infoActions:{padding:16,gap:8},infoAction:{minHeight:45,paddingHorizontal:14,borderRadius:14,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E4E4DE',flexDirection:'row',alignItems:'center',gap:8},infoActionText:{fontSize:12,fontWeight:'900',color:'#111111'},leaveAction:{backgroundColor:'#FFF1F1',borderColor:'#FFD4D4'},leaveText:{fontSize:12,fontWeight:'900',color:'#C62828'},renameIcon:{fontSize:12,fontWeight:'900'},membersTitle:{paddingHorizontal:16,paddingTop:4,paddingBottom:9,fontSize:13,fontWeight:'900',color:'#111111'},memberRow:{marginHorizontal:16,marginBottom:7,minHeight:62,padding:9,borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E4E4DE',flexDirection:'row',alignItems:'center'},memberSelected:{backgroundColor:'#FFFEE0',borderColor:'#111111'},memberAvatar:{width:42,height:42,borderRadius:21,backgroundColor:'#E7E7E1',marginRight:10},memberName:{fontSize:13,fontWeight:'800',color:'#22221F'},memberMeta:{fontSize:10,color:'#85857E',marginTop:2},removeText:{fontSize:10,fontWeight:'900',color:'#C62828'},check:{width:26,height:26,borderRadius:8,borderWidth:1,borderColor:'#B9B9B1',alignItems:'center',justifyContent:'center'},checkActive:{backgroundColor:'#FFFC00',borderColor:'#111111'},addButton:{margin:16,minHeight:49,borderRadius:16,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},addButtonText:{fontSize:13,fontWeight:'900',color:'#111111'}
});
