import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

const TermsOfService = ({ navigation }) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#111" /></TouchableOpacity>
      <Text style={styles.title}>Terms of Service</Text>
      <View style={styles.spacer} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>By using WeConnect, you agree to use the service responsibly and in accordance with these terms.</Text>
      <Text style={styles.heading}>Eligibility</Text><Text style={styles.body}>WeConnect is intended for members of participating college communities. You are responsible for providing accurate registration information and maintaining access to your account.</Text><Text style={styles.heading}>Acceptable use</Text><Text style={styles.body}>Use WeConnect for legitimate academic, professional and social campus interactions. Do not harass, threaten, impersonate, scam, spam, scrape, abuse or attempt to bypass access controls.</Text><Text style={styles.heading}>Content</Text><Text style={styles.body}>You retain responsibility for content you post or upload. Do not upload unlawful, infringing, malicious, confidential or abusive material.</Text><Text style={styles.heading}>Account security</Text><Text style={styles.body}>Keep your credentials secure. You are responsible for activity performed through your account unless you promptly report unauthorized access.</Text><Text style={styles.heading}>Moderation</Text><Text style={styles.body}>WeConnect may restrict or remove content or accounts when necessary to enforce these terms, investigate reports, protect users, or maintain service security.</Text><Text style={styles.heading}>Availability</Text><Text style={styles.body}>Features may change, be temporarily unavailable, or be discontinued as the product develops. We do not guarantee uninterrupted availability.</Text><Text style={styles.heading}>Account deletion</Text><Text style={styles.body}>You may request account deletion from Settings. Deletion does not necessarily erase information that must be retained for security, legal, fraud-prevention or operational reasons.</Text><Text style={styles.heading}>Changes</Text><Text style={styles.body}>These terms may change as the service evolves. Continued use after an updated version is published constitutes acceptance of the updated terms.</Text>
      <Text style={styles.note}>Last updated: September 22, 2026</Text>
    </ScrollView>
  </SafeAreaView>
);

const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#fff'},header:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#e5e7eb'},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},spacer:{width:42},title:{flex:1,textAlign:'center',fontSize:18,fontWeight:'800',color:'#111'},content:{padding:20,paddingBottom:50},intro:{fontSize:15,lineHeight:23,color:'#334155',marginBottom:8},heading:{fontSize:17,fontWeight:'900',color:'#111',marginTop:22,marginBottom:8},body:{fontSize:14,lineHeight:22,color:'#475569'},note:{fontSize:12,color:'#94a3b8',marginTop:28}});

export default TermsOfService;
