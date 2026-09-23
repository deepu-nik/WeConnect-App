import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

const CommunityGuidelines = ({ navigation }) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#111" /></TouchableOpacity>
      <Text style={styles.title}>Community Guidelines</Text>
      <View style={styles.spacer} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>WeConnect is built around real college communities. Treat classmates with respect and help keep the platform useful and safe.</Text>
      <Text style={styles.heading}>Respect others</Text><Text style={styles.body}>Do not bully, harass, threaten, stalk, sexually harass or repeatedly target another student.</Text><Text style={styles.heading}>Be authentic</Text><Text style={styles.body}>Do not impersonate another student, faculty member, organization or institution. Do not use misleading identities to deceive others.</Text><Text style={styles.heading}>No scams or spam</Text><Text style={styles.body}>Do not run scams, phishing attempts, deceptive promotions, spam campaigns or fraudulent transactions through WeConnect.</Text><Text style={styles.heading}>Protect privacy</Text><Text style={styles.body}>Do not publish another person's private contact information, personal documents, credentials or sensitive information without permission.</Text><Text style={styles.heading}>Academic integrity</Text><Text style={styles.body}>Do not use WeConnect to facilitate cheating, impersonation in assessments, plagiarism or other academic misconduct.</Text><Text style={styles.heading}>Report problems</Text><Text style={styles.body}>Use the report feature when you encounter harassment, scams, impersonation or other serious violations. Do not misuse reporting to target classmates unfairly.</Text><Text style={styles.heading}>Enforcement</Text><Text style={styles.body}>Violations may result in content removal, interaction restrictions, account restrictions or account termination depending on severity and recurrence.</Text>
      <Text style={styles.note}>Last updated: September 22, 2026</Text>
    </ScrollView>
  </SafeAreaView>
);

const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#fff'},header:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#e5e7eb'},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},spacer:{width:42},title:{flex:1,textAlign:'center',fontSize:18,fontWeight:'800',color:'#111'},content:{padding:20,paddingBottom:50},intro:{fontSize:15,lineHeight:23,color:'#334155',marginBottom:8},heading:{fontSize:17,fontWeight:'900',color:'#111',marginTop:22,marginBottom:8},body:{fontSize:14,lineHeight:22,color:'#475569'},note:{fontSize:12,color:'#94a3b8',marginTop:28}});

export default CommunityGuidelines;
