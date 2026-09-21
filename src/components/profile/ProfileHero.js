import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, MoreHorizontal, Share2, Settings } from 'lucide-react-native';

const ProfileHero = ({ user, isSelf, isConnected, connectionState, uploading, onAvatarPress, onAvatarEdit, onCoverEdit, onEdit, onMessage, onConnect, onShare, onMenu }) => (
  <View style={styles.shell}>
    <View style={styles.cover}>
      {user.coverPhoto ? <Image source={{ uri: user.coverPhoto }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : <View style={styles.coverFallback} />}
      <View style={styles.coverGradient} />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={isSelf ? onEdit : onMenu}>
          {isSelf ? <Settings size={19} color="#fff" /> : <MoreHorizontal size={21} color="#fff" />}
        </TouchableOpacity>
        {isSelf ? (
          <TouchableOpacity style={styles.iconButton} onPress={onCoverEdit}><Camera size={18} color="#fff" /></TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconButton} onPress={onShare}><Share2 size={18} color="#fff" /></TouchableOpacity>
        )}
      </View>
    </View>
    <View style={styles.body}>
      <View style={styles.identityRow}>
        <View style={styles.avatarWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={onAvatarPress}>
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          </TouchableOpacity>
          {isSelf && <TouchableOpacity style={styles.avatarEdit} onPress={onAvatarEdit} disabled={uploading}><Camera size={13} color="#fff" /></TouchableOpacity>}
          {uploading && <View style={styles.uploadOverlay}><Text style={styles.uploadText}>…</Text></View>}
        </View>
        <View style={styles.actionRow}>
          {isSelf ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onEdit}><Text style={styles.secondaryText}>Edit Profile</Text></TouchableOpacity>
          ) : (
            <>
              {isConnected ? (
                <>
                  <View style={styles.connectedPill}><Text style={styles.connectedText}>Connected</Text></View>
                  <TouchableOpacity style={styles.secondaryButton} onPress={onMessage}><Text style={styles.secondaryText}>Message</Text></TouchableOpacity>
                </>
              ) : connectionState === 'pending' ? (
                <View style={styles.pendingPill}><Text style={styles.pendingText}>Requested</Text></View>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={onConnect}><Text style={styles.primaryText}>Connect</Text></TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.handle}>{user.handle || '@student'}</Text>
      <Text style={styles.role}>{user.course || 'Computer Science'}{user.gradYear ? '  •  Class of ' + user.gradYear : ''}</Text>
      {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
    </View>
  </View>
);

const styles=StyleSheet.create({
  shell:{backgroundColor:'#fff'},
  cover:{height:210,backgroundColor:'#171713',position:'relative'},
  coverFallback:{...StyleSheet.absoluteFillObject,backgroundColor:'#191916'},
  coverGradient:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.24)'},
  topBar:{paddingTop:48,paddingHorizontal:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  iconButton:{width:40,height:40,borderRadius:20,backgroundColor:'rgba(0,0,0,.42)',alignItems:'center',justifyContent:'center'},
  body:{paddingHorizontal:18,paddingBottom:18},
  identityRow:{minHeight:78,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},
  avatarWrap:{width:96,height:96,marginTop:-48,position:'relative'},
  avatar:{width:96,height:96,borderRadius:48,borderWidth:4,borderColor:'#fff',backgroundColor:'#E7E7E1'},
  avatarEdit:{position:'absolute',right:0,bottom:0,width:29,height:29,borderRadius:15,backgroundColor:'#111',borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
  uploadOverlay:{...StyleSheet.absoluteFillObject,borderRadius:48,backgroundColor:'rgba(0,0,0,.45)',alignItems:'center',justifyContent:'center'},
  uploadText:{color:'#fff',fontSize:24,fontWeight:'900'},
  actionRow:{flexDirection:'row',gap:7,alignItems:'center',paddingBottom:8},
  primaryButton:{height:38,paddingHorizontal:16,borderRadius:19,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},
  primaryText:{color:'#fff',fontSize:12,fontWeight:'900'},
  secondaryButton:{height:38,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:'#DCDCD5',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  secondaryText:{color:'#111',fontSize:12,fontWeight:'900'},
  connectedPill:{height:34,paddingHorizontal:10,borderRadius:17,backgroundColor:'#E9F7EC',alignItems:'center',justifyContent:'center'},connectedText:{color:'#218838',fontSize:10,fontWeight:'900'},
  pendingPill:{height:38,paddingHorizontal:13,borderRadius:19,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center'},pendingText:{color:'#777770',fontSize:11,fontWeight:'900'},
  name:{marginTop:10,fontSize:27,fontWeight:'900',letterSpacing:-.7,color:'#111'},
  handle:{marginTop:2,fontSize:13,fontWeight:'600',color:'#7A7A73'},
  role:{marginTop:9,fontSize:13,fontWeight:'800',color:'#6C6C66'},
  bio:{marginTop:10,fontSize:14.5,lineHeight:21,color:'#3E3E39'},
});
export default ProfileHero;
