import { supabase } from '@/lib/supabase';
import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert(error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    if (!name || !location) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    setLoading(true);
    
    try {
      // Create user account
      const { data: { user }, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (signUpError) {
        Alert.alert('Error', signUpError.message);
        setLoading(false);
        return;
      }

      if (user) {
        // First, create the user record in the users table
        const { error: userRecordError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: email,
            name: name,
            user_type: 'retailer',
          });

        if (userRecordError) {
          console.error('Error creating user record:', userRecordError);
          Alert.alert('Error', 'Failed to create user record: ' + userRecordError.message);
          setLoading(false);
          return;
        }

        // Then create retailer profile
        const { error: profileError } = await supabase
          .from('retailers')
          .insert({
            user_id: user.id,
            name: name,
            email: email,
            location: location,
            registered_businesses: [],
          });

        if (profileError) {
          console.error('Error creating retailer profile:', profileError);
          Alert.alert('Error', 'Failed to create retailer profile: ' + profileError.message);
          setLoading(false);
          return;
        }

        Alert.alert('Success', 'Check your email for verification link!');
        // Reset form
        setEmail('');
        setPassword('');
        setName('');
        setLocation('');
        setIsSignUp(false);
      }
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
    
    setLoading(false);
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white">
      <Text className="text-3xl font-bold text-center mb-8 text-green-600">
        EcoTrace Retailer
      </Text>
      
      <View className="space-y-4">
        {isSignUp && (
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-base"
            placeholder="Retailer Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}
        
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        {isSignUp && (
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-base"
            placeholder="Location/City"
            value={location}
            onChangeText={setLocation}
            autoCapitalize="words"
          />
        )}
        
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity
          className="bg-green-600 rounded-lg py-3 mt-4"
          onPress={isSignUp ? signUpWithEmail : signInWithEmail}
          disabled={loading}
        >
          <Text className="text-white text-center font-semibold text-base">
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          className="mt-4"
          onPress={() => {
            setIsSignUp(!isSignUp);
            // Reset form when switching modes
            if (isSignUp) {
              setEmail('');
              setPassword('');
              setName('');
              setLocation('');
            }
          }}
        >
          <Text className="text-green-600 text-center">
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}