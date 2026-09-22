import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList } from 'react-native';
import { ArrowLeft, Check, Search, Users } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { createGroup } from '../services/groupService';

const YELLOW = '#FFFC00';

export default function CreateGroupScreen({ navigation }) {
  const uid = auth.currentUser?.uid;
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getUserProfile(uid);
        if (!active) return;
        setProfile(me);
        const ids = Array.isArray(me?.connections) ? me.connections.filter((id) => id !== uid) : [];
        const profiles = await Promise.all(ids.map((id) => getUserProfile(id).catch(() => null)));
        if (active) setPeople(profiles.filter(Boolean));
      } catch (error) {
        Alert.alert('Could not load contacts', error?.message || 'Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [uid]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? people.filter((item) => (item.name || '').toLowerCase().includes(term) || (item.handle || '').toLowerCase().includes(term)) : people;
  }, [people, search]);

  const toggle = (person) => {
    setSelected((current) => current.includes(person.uid) ? current.filter((id) => id !== person.uid) : [...current, person.uid]);
  };

  const submit = async () => {
    if (!name.trim()) return Alert.alert('Group name required', 'Give your group a name.');
    if (!selected.length) return Alert.alert('Add members', 'Select at least one connected student.');
    setCreating(true);
    try {
      const groupId = await createGroup({ name, description, memberIds: selected });
      navigation.replace('ChatRoom', { chatType: 'group', groupId });
    } catch (error) {
      Alert.alert('Could not create group', error?.message || 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}><ArrowLeft size={21} color="#111111" /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.eyebrow}>NEW GROUP</Text><Text style={styles.title}>Create a group</Text></View>
        <TouchableOpacity onPress={submit} disabled={creating || loading} style={styles.createButton}>
          {creating ? <ActivityIndicator size="small" color="#111111" /> : <Text style={styles.createButtonText}>Create</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <View style={styles.groupPreview}><View style={styles.groupIcon}><Users size={27} color="#111111" /></View><View style={{ flex: 1 }}><Text style={styles.previewTitle}>{name.trim() || 'Your new group'}</Text><Text style={styles.previewSub}>{selected.length + 1} members including you</Text></View></View>
        <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor="#999999" style={styles.input} maxLength={50} />
        <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor="#999999" style={[styles.input, styles.description]} multiline maxLength={140} />
        <View style={styles.memberHeader}><Text style={styles.sectionTitle}>Add connected students</Text><Text style={styles.count}>{selected.length}/49</Text></View>
        <View style={styles.search}><Search size={17} color="#777770" /><TextInput value={search} onChangeText={setSearch} placeholder="Search connections" placeholderTextColor="#999999" style={styles.searchInput} /></View>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator size="large" color="#111111" /></View> : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Users size={35} color="#A0A099" /><Text style={styles.emptyTitle}>No connections found</Text><Text style={styles.emptyText}>Connect with classmates first, then add them here.</Text></View>}
          renderItem={({ item }) => {
            const active = selected.includes(item.uid);
            return <TouchableOpacity style={[styles.person, active && styles.personActive]} onPress={() => toggle(item)} activeOpacity={0.82}>
              <Image source={{ uri: item.avatar || item.photoURL || 'https://via.placeholder.com/100' }} style={styles.avatar} />
              <View style={{ flex: 1 }}><Text style={styles.name}>{item.name || 'Student'}</Text><Text style={styles.meta}>{item.handle || 'WeConnect connection'}</Text></View>
              <View style={[styles.check, active && styles.checkActive]}>{active ? <Check size={17} color="#111111" /> : null}</View>
            </TouchableOpacity>;
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F6F6F2'},
  header:{padding:14,flexDirection:'row',alignItems:'center',gap:11,backgroundColor:'#FFFFFF',borderBottomWidth:1,borderBottomColor:'#E4E4DE'},
  iconButton:{width:40,height:40,borderRadius:13,backgroundColor:'#F0F0EB',alignItems:'center',justifyContent:'center'},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#8A8A84'}, title:{fontSize:19,fontWeight:'900',color:'#111111',marginTop:2},
  createButton:{minWidth:68,height:40,borderRadius:14,backgroundColor:YELLOW,alignItems:'center',justifyContent:'center'},createButtonText:{fontSize:12,fontWeight:'900',color:'#111111'},
  form:{padding:16},groupPreview:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E4E4DE',borderRadius:20,padding:13,flexDirection:'row',alignItems:'center',gap:11,marginBottom:12},
  groupIcon:{width:50,height:50,borderRadius:16,backgroundColor:YELLOW,alignItems:'center',justifyContent:'center'},previewTitle:{fontSize:16,fontWeight:'900',color:'#111111'},previewSub:{fontSize:11,color:'#777770',marginTop:3},
  input:{minHeight:50,borderWidth:1,borderColor:'#E4E4DE',borderRadius:15,backgroundColor:'#FFFFFF',paddingHorizontal:14,color:'#111111',fontSize:14,marginBottom:9},description:{minHeight:76,paddingTop:13,textAlignVertical:'top'},
  memberHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:4,marginBottom:8},sectionTitle:{fontSize:14,fontWeight:'900',color:'#111111'},count:{fontSize:11,fontWeight:'800',color:'#777770'},
  search:{height:45,borderRadius:14,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E4E4DE',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchInput:{flex:1,color:'#111111'},
  list:{paddingHorizontal:16,paddingBottom:30},person:{minHeight:66,padding:10,borderRadius:17,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E5E5DF',flexDirection:'row',alignItems:'center',marginBottom:7},personActive:{backgroundColor:'#FFFEE0',borderColor:'#111111'},avatar:{width:44,height:44,borderRadius:22,backgroundColor:'#E7E7E1',marginRight:11},name:{fontSize:14,fontWeight:'800',color:'#22221F'},meta:{fontSize:10.5,color:'#85857E',marginTop:3},check:{width:27,height:27,borderRadius:9,borderWidth:1.5,borderColor:'#B9B9B1',alignItems:'center',justifyContent:'center'},checkActive:{backgroundColor:YELLOW,borderColor:'#111111'},loading:{flex:1,alignItems:'center',justifyContent:'center'},empty:{alignItems:'center',padding:45},emptyTitle:{fontSize:17,fontWeight:'900',color:'#111111',marginTop:10},emptyText:{fontSize:12,color:'#777770',textAlign:'center',lineHeight:18,marginTop:5}
});
