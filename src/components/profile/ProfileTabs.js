import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
const ProfileTabs=({active,onChange})=><View style={styles.wrap}>{[['posts','Posts'],['projects','Projects'],['activity','Activity']].map(([key,label])=><TouchableOpacity key={key} style={styles.tab} onPress={()=>onChange(key)}><Text style={[styles.text,active===key&&styles.active]}>{label}</Text>{active===key?<View style={styles.line}/>:null}</TouchableOpacity>)}</View>;
const styles=StyleSheet.create({wrap:{marginTop:24,paddingHorizontal:16,flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#E5E5DF'},tab:{flex:1,height:46,alignItems:'center',justifyContent:'center',position:'relative'},text:{fontSize:12,fontWeight:'800',color:'#85857E'},active:{color:'#111'},line:{position:'absolute',bottom:-1,height:2,width:42,borderRadius:2,backgroundColor:'#111'}});
export default ProfileTabs;
