import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from 'firebase/auth';
import { doc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import {
  Camera, CheckCircle, Code, Github, Globe, Instagram, Link as LinkIcon,
  Linkedin, MapPin, Plus, Settings, Trash2, Twitter, UserRound, X, Youtube,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../config/firebase';
import { getUserProfile, FALLBACK_AVATAR } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const SKILL_COLORS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#FF3B30', '#5856D6'];

const ProfileScreen = ({ route, navigation }) => {
  const currentUser = auth.currentUser;
  const targetUid = route?.params?.uid || currentUser?.uid;
  const isSelf = targetUid === currentUser?.uid;

  const [user, setUser] = useState(null);
  const [vaultCount, setVaultCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [form, setForm] = useState(null);
  const [newSkill, setNewSkill] = useState('');


