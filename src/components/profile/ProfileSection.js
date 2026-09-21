import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
const ProfileSection=({title,subtitle,action,children})=>(
  <View style={styles.section}>
    <View style={styles.header}><View><Text style={styles.title}>{title}</Text>{subtitle?<Text style={styles.subtitle}>{subtitle}</Text>:null}</View>{action?<TouchableOpacity onPress={action.onPress}><Text style={styles.action}>{action.label}</Text></TouchableOpacity>:null}</View>
    {children}
  </View>
);
const styles=StyleSheet.create({
 section:{marginTop:20,paddingHorizontal:16},
 header:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:10},
 title:{fontSize:18,fontWeight:'900',color:'#111',letterSpacing:-.3},
 subtitle:{fontSize:11,color:'#898982',marginTop:3},
 action:{fontSize:12,fontWeight:'900',color:'#111'},
});
export default ProfileSection;
