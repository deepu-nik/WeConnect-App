import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Github, Globe, Instagram, Linkedin, Link as LinkIcon, MessageCircle } from 'lucide-react-native';
const ProfileLinks=({user,onOpen})=>{
 const items=[
  user.website&&['Website',user.website,Globe],
  user.github&&['GitHub',user.github,Github],
  user.linkedin&&['LinkedIn',user.linkedin,Linkedin],
  user.instagram&&['Instagram',user.instagram,Instagram],
  user.resumeLink&&['Resume / Portfolio',user.resumeLink,LinkIcon],
  user.whatsapp&&['WhatsApp',user.whatsapp,MessageCircle],
 ].filter(Boolean);
 if(!items.length)return <View style={styles.empty}><Text style={styles.emptyText}>Add your professional and social links.</Text></View>;
 return <View style={styles.grid}>{items.map(([label,value,Icon])=><TouchableOpacity key={label} style={styles.item} onPress={()=>onOpen(value,label)}><View style={styles.icon}><Icon size={17} color="#111"/></View><View style={styles.copy}><Text style={styles.label}>{label}</Text><Text style={styles.value} numberOfLines={1}>{String(value).replace(/^https?:\/\//,'')}</Text></View></TouchableOpacity>)}</View>;
};
const styles=StyleSheet.create({
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},item:{width:'48.8%',minHeight:58,borderRadius:16,borderWidth:1,borderColor:'#E5E5DF',backgroundColor:'#fff',padding:10,flexDirection:'row',alignItems:'center'},icon:{width:34,height:34,borderRadius:11,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,marginLeft:9},label:{fontSize:11,fontWeight:'900',color:'#222'},value:{fontSize:10,color:'#85857E',marginTop:3},empty:{padding:18,borderRadius:17,backgroundColor:'#F0F0EC'},emptyText:{fontSize:12,color:'#777770',fontWeight:'700'},
});
export default ProfileLinks;
