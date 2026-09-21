import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
const ProfileStats=({stats,onPress})=>(
  <View style={styles.card}>
    {stats.map((item,index)=><TouchableOpacity key={item.label} style={[styles.stat,index<stats.length-1&&styles.divider]} onPress={()=>onPress?.(item.key)}>
      <Text style={styles.value}>{item.value}</Text><Text style={styles.label}>{item.label}</Text>
    </TouchableOpacity>)}
  </View>
);
const styles=StyleSheet.create({
 card:{marginTop:12,marginHorizontal:16,paddingVertical:15,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5DF',flexDirection:'row'},
 stat:{flex:1,alignItems:'center',justifyContent:'center',minHeight:48},
 divider:{borderRightWidth:1,borderRightColor:'#E7E7E1'},
 value:{fontSize:20,fontWeight:'900',color:'#111'},
 label:{fontSize:10.5,fontWeight:'700',color:'#85857E',marginTop:4},
});
export default ProfileStats;
