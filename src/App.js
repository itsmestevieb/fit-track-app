import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, setDoc, getDocs, where, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Plus, Dumbbell, Zap, Weight, Users, LogOut, UserPlus, BrainCircuit, X, Edit, ChevronsUp, ChevronsDown, ChevronRight } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [db, setDb] = useState(null);
    const [authUid, setAuthUid] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [loadingProfiles, setLoadingProfiles] = useState(true);

    const [workouts, setWorkouts] = useState([]);
    const [weightLog, setWeightLog] = useState([]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [view, setView] = useState('dashboard');
    const [loadingData, setLoadingData] = useState(true);
    const [editingWorkout, setEditingWorkout] = useState(null);

    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            setDb(getFirestore(app));

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setAuthUid(user.uid);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined') {
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Error signing in:", error);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization error:", error);
            setIsAuthReady(true);
        }
    }, []);

    // --- Profile Fetching ---
    useEffect(() => {
        if (!isAuthReady || !db || !authUid) return;
        
        setLoadingProfiles(true);
        const profilesCollectionPath = `/artifacts/${appId}/users/${authUid}/profiles`;
        const q = query(collection(db, profilesCollectionPath));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const profilesData = [];
            querySnapshot.forEach((doc) => {
                profilesData.push({ id: doc.id, ...doc.data() });
            });
            setProfiles(profilesData);
            setLoadingProfiles(false);
        }, (error) => {
            console.error("Error fetching profiles:", error);
            setLoadingProfiles(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, authUid]);

    // --- Data Fetching for Selected Profile ---
    useEffect(() => {
        if (!selectedProfile) {
            setWorkouts([]);
            setWeightLog([]);
            return;
        };

        setLoadingData(true);
        const basePath = `/artifacts/${appId}/users/${authUid}/profiles/${selectedProfile.id}`;

        const qWorkouts = query(collection(db, `${basePath}/workouts`));
        const unsubscribeWorkouts = onSnapshot(qWorkouts, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setWorkouts(data);
            setLoadingData(false);
        }, (err) => { console.error("Workout fetch error:", err); setLoadingData(false); });

        const qWeightLog = query(collection(db, `${basePath}/weightLog`));
        const unsubscribeWeightLog = onSnapshot(qWeightLog, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setWeightLog(data);
        }, (err) => console.error("Weight log fetch error:", err));

        return () => {
            unsubscribeWorkouts();
            unsubscribeWeightLog();
        };
    }, [selectedProfile, db, authUid]);

    // --- Calculate Most Recent Weight ---
    useEffect(() => {
        const allEntries = [
            ...weightLog.filter(l => l.weight && l.date).map(l => ({ date: l.date, weight: l.weight })),
            ...workouts.filter(w => w.currentWeight && w.date).map(w => ({ date: w.date, weight: w.currentWeight }))
        ];
        if (allEntries.length > 0) {
            allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
            setCurrentWeight(allEntries[0].weight);
        } else {
            setCurrentWeight('');
        }
    }, [workouts, weightLog]);

    // --- Data Handlers ---
    const handleAddWorkout = async (workout) => {
        if (!db || !authUid || !selectedProfile) return;
        const path = `/artifacts/${appId}/users/${authUid}/profiles/${selectedProfile.id}/workouts`;
        const data = { ...workout };
        if (!data.currentWeight) delete data.currentWeight;
        await addDoc(collection(db, path), data);
        setView('dashboard');
    };
    
    const handleUpdateWorkout = async (workoutId, workoutData) => {
        if (!db || !authUid || !selectedProfile) return;
        const path = `/artifacts/${appId}/users/${authUid}/profiles/${selectedProfile.id}/workouts/${workoutId}`;
        const docRef = doc(db, path);
        await updateDoc(docRef, workoutData);
        setView('dashboard');
        setEditingWorkout(null);
    };

    const handleLogWeight = async (weightEntry) => {
        if (!db || !authUid || !selectedProfile) return;
        const path = `/artifacts/${appId}/users/${authUid}/profiles/${selectedProfile.id}/weightLog`;
        await addDoc(collection(db, path), weightEntry);
        setView('dashboard');
    };

    const handleDeleteWorkout = async (id) => {
        if (!db || !authUid || !selectedProfile) return;
        const path = `/artifacts/${appId}/users/${authUid}/profiles/${selectedProfile.id}/workouts/${id}`;
        await deleteDoc(doc(db, path));
    };
    
    const handleCreateProfile = async (name) => {
        if (!db || !authUid) return;
        const path = `/artifacts/${appId}/users/${authUid}/profiles`;
        const newProfileRef = await addDoc(collection(db, path), { name });
        setSelectedProfile({ id: newProfileRef.id, name });
    };
    
    const handleSwitchUser = () => {
      setSelectedProfile(null);
      setView('dashboard');
    };
    
    const startEditWorkout = (workout) => {
        setEditingWorkout(workout);
        setView('editWorkout');
    };

    // --- Render Logic ---
    if (!isAuthReady || loadingProfiles) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Users className="w-16 h-16 animate-pulse mx-auto text-cyan-400" /><p className="mt-4 text-lg">Loading Profiles...</p></div>;
    }

    if (!selectedProfile) {
        return <ProfileSelector profiles={profiles} onSelectProfile={setSelectedProfile} onCreateProfile={handleCreateProfile} />;
    }
    
    const renderView = () => {
        if (loadingData && view === 'dashboard') {
            return <div className="flex items-center justify-center h-64"><Dumbbell className="w-12 h-12 animate-spin text-cyan-400" /></div>;
        }
        switch (view) {
            case 'addWorkout': return <WorkoutForm onSave={handleAddWorkout} onCancel={() => setView('dashboard')} />;
            case 'editWorkout': return <WorkoutForm onSave={(data) => handleUpdateWorkout(editingWorkout.id, data)} onCancel={() => { setView('dashboard'); setEditingWorkout(null); }} existingWorkout={editingWorkout} />;
            case 'logWeight': return <LogWeightForm onLogWeight={handleLogWeight} onCancel={() => setView('dashboard')} />;
            case 'generatePlan': return <GeneratePlanView onCancel={() => setView('dashboard')} />;
            default: return <Dashboard workouts={workouts} currentWeight={currentWeight} setView={setView} onDeleteWorkout={handleDeleteWorkout} onEditWorkout={startEditWorkout} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <header className="bg-gray-800 shadow-lg p-4 sticky top-0 z-10">
                <div className="container mx-auto max-w-4xl flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-cyan-400 flex items-center"><Dumbbell className="mr-3" />FitTrack</h1>
                    <div className="flex items-center space-x-4">
                        <span className="font-semibold text-white">Hi, {selectedProfile.name}!</span>
                        <button onClick={handleSwitchUser} className="flex items-center text-gray-300 hover:text-cyan-400 transition-colors" title="Switch User"><LogOut size={20}/></button>
                    </div>
                </div>
            </header>
            <main className="container mx-auto max-w-4xl p-4 md:p-6">{renderView()}</main>
            <footer className="text-center p-4 text-gray-500 text-xs"><p>Built with React & Firebase. Powered by Gemini.</p></footer>
        </div>
    );
}

// --- Gemini API Call Helper ---
const callGeminiAPI = async (prompt) => {
    const apiKey = ""; // Leave blank, handled by environment
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            weeklyPlan: {
              type: "ARRAY",
              description: "A 5-day workout plan.",
              items: {
                type: "OBJECT",
                properties: {
                  day: { type: "STRING" },
                  focus: { type: "STRING" },
                  exercises: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        name: { type: "STRING" },
                        sets: { type: "STRING" },
                        reps: { type: "STRING" }
                      },
                      required: ["name", "sets", "reps"]
                    }
                  }
                },
                required: ["day", "focus", "exercises"]
              }
            }
          },
          required: ["weeklyPlan"]
        }
      }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
    }

    const result = await response.json();
    if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
        return JSON.parse(result.candidates[0].content.parts[0].text);
    } else {
        throw new Error("Invalid response structure from API.");
    }
};

// --- Generate Plan & Modal Components ---
const GeneratePlanView = ({ onCancel }) => {
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [plan, setPlan] = useState(null);
    
    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!goal.trim()) return;
        setLoading(true); 
        setError(null); 
        setPlan(null);
        const prompt = `You are an expert personal trainer. Create a well-balanced, 5-day weekly workout plan for a user whose goal is to "${goal}". For each day, provide a focus (e.g., "Chest & Triceps") and a list of 4-5 exercises. For each exercise, specify the number of sets and reps. Provide the response as a valid JSON object adhering to the provided schema.`;
        try {
            const result = await callGeminiAPI(prompt);
            setPlan(result.weeklyPlan);
        } catch (err) {
            console.error("Gemini API error:", err);
            setError("Sorry, I couldn't generate a plan right now. Please try again later.");
        } finally { 
            setLoading(false); 
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400 flex items-center">
                <BrainCircuit className="mr-3" /> AI Workout Plan Generator
            </h2>
            <p className="text-gray-300">
                Tell us your fitness goal, and our AI will generate a personalized 5-day workout plan for you.
            </p>
            <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                    <label htmlFor="goal" className="block text-sm font-medium text-gray-300 mb-1">
                        What is your primary fitness goal?
                    </label>
                    <input 
                        id="goal" 
                        type="text" 
                        value={goal} 
                        onChange={(e) => setGoal(e.target.value)} 
                        placeholder="e.g., build muscle, lose weight, improve endurance" 
                        className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 focus:ring-cyan-500 focus:border-cyan-500" 
                        required 
                    />
                </div>
                <div className="flex items-center justify-end space-x-4">
                    <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">
                        Back to Dashboard
                    </button>
                    <button type="submit" disabled={loading} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center">
                        {loading ? <Dumbbell className="w-5 h-5 animate-spin mr-2"/> : '✨ Generate Plan'}
                    </button>
                </div>
            </form>
            {error && (
                <Modal title="Error" onClose={() => setError(null)}>
                    <p className="text-red-400">{error}</p>
                </Modal>
            )}
            {plan && (
                <Modal title={`Your Plan for "${goal}"`} onClose={() => setPlan(null)}>
                    <WorkoutPlanDisplay plan={plan} />
                </Modal>
            )}
        </div>
    );
};

const Modal = ({ title, children, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-full overflow-y-auto">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
                    <h3 className="text-xl font-bold text-cyan-400">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

const WorkoutPlanDisplay = ({ plan }) => {
    return (
        <div className="space-y-6">
            {plan.map((dayPlan, index) => (
                <div key={index} className="bg-gray-700/50 p-4 rounded-lg">
                    <h4 className="text-lg font-bold text-cyan-400">
                        {dayPlan.day}: <span className="text-yellow-400">{dayPlan.focus}</span>
                    </h4>
                    <ul className="mt-2 space-y-2">
                        {dayPlan.exercises.map((exercise, i) => (
                            <li key={i} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                                <span className="font-semibold text-gray-200">{exercise.name}</span>
                                <span className="text-gray-300">{exercise.sets} sets x {exercise.reps} reps</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

// --- Profile Selector Component ---
const ProfileSelector = ({ profiles, onSelectProfile, onCreateProfile }) => {
    const [newName, setNewName] = useState('');
    const handleCreate = (e) => { 
        e.preventDefault(); 
        if (newName.trim()) { 
            onCreateProfile(newName.trim()); 
            setNewName(''); 
        } 
    };
    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-xl p-8 text-white">
                <h2 className="text-3xl font-bold text-center text-cyan-400 mb-6">Select Profile</h2>
                <div className="space-y-4 mb-8">
                    {profiles.map(profile => (
                        <button key={profile.id} onClick={() => onSelectProfile(profile)} className="w-full text-left bg-gray-700 hover:bg-cyan-500 p-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105">
                            {profile.name}
                        </button>
                    ))}
                </div>
                <h3 className="text-xl font-bold text-center text-cyan-400 mb-4">Or Create New</h3>
                <form onSubmit={handleCreate} className="flex space-x-2">
                    <input 
                        type="text" 
                        value={newName} 
                        onChange={(e) => setNewName(e.target.value)} 
                        placeholder="Enter your name" 
                        className="flex-grow bg-gray-700 border-gray-600 rounded-lg p-3 focus:ring-cyan-500 focus:border-cyan-500" 
                    />
                    <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center">
                        <UserPlus />
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- Dashboard Component ---
const Dashboard = ({ workouts, currentWeight, setView, onDeleteWorkout, onEditWorkout }) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-sm">Current Weight</p>
                        <p className="text-3xl font-bold">{currentWeight ? `${currentWeight} lbs` : 'N/A'}</p>
                    </div>
                    <Weight className="w-10 h-10 text-cyan-400" />
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-sm">Total Workouts</p>
                        <p className="text-3xl font-bold">{workouts.length}</p>
                    </div>
                    <Dumbbell className="w-10 h-10 text-cyan-400" />
                </div>
            </div>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button onClick={() => setView('addWorkout')} className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"><Plus className="mr-2" /> Add Workout</button>
                <button onClick={() => setView('logWeight')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"><Weight className="mr-2" /> Log Weight</button>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center">
                <h3 className="text-lg font-semibold mb-2 text-cyan-400">Need a Plan?</h3>
                <p className="text-gray-300 mb-4">Let our AI generate a personalized workout plan for you.</p>
                <button onClick={() => setView('generatePlan')} className="bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105 w-full md:w-auto mx-auto"><BrainCircuit className="mr-2" /> ✨ Generate Workout Plan</button>
            </div>
            <div>
                <h2 className="text-xl font-bold mb-4 text-cyan-400">Workout History</h2>
                <div className="space-y-4">
                    {workouts.length > 0 ? (
                        workouts.map(workout => <WorkoutCard key={workout.id} workout={workout} onDelete={onDeleteWorkout} onEdit={onEditWorkout} />)
                    ) : (
                        <p className="text-gray-400 text-center py-8">No workouts logged yet. Add one to get started!</p>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- Workout Card Component ---
const WorkoutCard = ({ workout, onDelete, onEdit }) => {
    const formatDate = (dateString) => new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return (
        <div className="bg-gray-800 p-5 rounded-lg shadow-md hover:shadow-cyan-500/20 transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="font-bold text-lg text-cyan-400">{formatDate(workout.date)}</p>
                    {workout.currentWeight && (<div className="flex items-center text-gray-400 text-sm mt-1"><Weight size={14} className="mr-2"/><span>Body Weight: {workout.currentWeight} lbs</span></div>)}
                </div>
                <div className="flex items-center space-x-2">
                     <button onClick={() => onEdit(workout)} className="text-gray-400 hover:text-cyan-400 p-1 rounded-full transition-colors"><Edit size={20} /></button>
                     <button onClick={() => onDelete(workout.id)} className="text-gray-400 hover:text-red-400 p-1 rounded-full transition-colors"><Trash2 size={20} /></button>
                </div>
            </div>
            {workout.cardio && workout.cardio.length > 0 && (
                <div className="mb-4">
                    <h4 className="font-semibold flex items-center text-yellow-400"><Zap size={16} className="mr-2"/>Cardio</h4>
                    <ul className="list-disc list-inside mt-2 text-gray-300 space-y-1">
                        {workout.cardio.map((c, i) => <li key={i}>{c.type}: {c.duration} mins, {c.distance} km</li>)}
                    </ul>
                </div>
            )}
            {workout.weights && workout.weights.length > 0 && (
                <div>
                    <h4 className="font-semibold flex items-center text-cyan-400"><Dumbbell size={16} className="mr-2"/>Weightlifting</h4>
                    <div className="mt-2 space-y-3">
                        {workout.weights.map((exercise, i) => (
                            <div key={i}>
                                <p className="font-semibold text-gray-200">{exercise.name}</p>
                                <ul className="text-sm text-gray-400 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 mt-1">
                                    {exercise.sets.map((set, j) => <li key={j} className="flex items-center"><ChevronRight size={12} className="mr-1" />{set.reps} reps @ {set.weight} lbs</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Universal Workout Form Component ---
const WorkoutForm = ({ onSave, onCancel, existingWorkout = null }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [cardio, setCardio] = useState([]);
    const [weights, setWeights] = useState([]);

    useEffect(() => {
        if (existingWorkout) {
            setDate(existingWorkout.date || new Date().toISOString().split('T')[0]);
            setCurrentWeight(existingWorkout.currentWeight || '');
            setCardio(existingWorkout.cardio || []);
            setWeights(existingWorkout.weights || []);
        }
    }, [existingWorkout]);

    // Handlers for Cardio
    const addCardio = () => setCardio([...cardio, { type: '', duration: '', distance: '' }]);
    const removeCardio = (index) => setCardio(cardio.filter((_, i) => i !== index));
    const handleCardioChange = (index, field, value) => {
        const updated = [...cardio];
        updated[index][field] = value;
        setCardio(updated);
    };

    // Handlers for Weightlifting
    const addWeightExercise = () => setWeights([...weights, { name: '', sets: [{ reps: '', weight: '' }] }]);
    const removeWeightExercise = (exIndex) => setWeights(weights.filter((_, i) => i !== exIndex));
    const handleExerciseNameChange = (exIndex, value) => {
        const updated = [...weights];
        updated[exIndex].name = value;
        setWeights(updated);
    };
    const addSet = (exIndex) => {
        const updated = [...weights];
        updated[exIndex].sets.push({ reps: '', weight: '' });
        setWeights(updated);
    };
    const removeSet = (exIndex, setIndex) => {
        const updated = [...weights];
        updated[exIndex].sets = updated[exIndex].sets.filter((_, i) => i !== setIndex);
        setWeights(updated);
    };
    const handleSetChange = (exIndex, setIndex, field, value) => {
        const updated = [...weights];
        updated[exIndex].sets[setIndex][field] = value;
        setWeights(updated);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ date, currentWeight, cardio, weights });
    };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400">{existingWorkout ? 'Edit Workout' : 'Add New Workout'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Your Weight (lbs) <span className="text-gray-500">(Optional)</span></label>
                    <input type="number" step="0.1" placeholder="e.g., 165.5" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" />
                </div>
            </div>

            {/* Cardio Section */}
            <div>
                <h3 className="text-lg font-semibold flex items-center text-yellow-400"><Zap size={18} className="mr-2"/>Cardio</h3>
                {cardio.map((c, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2 p-3 bg-gray-700/50 rounded-lg">
                        <input type="text" placeholder="Activity" value={c.type} onChange={e => handleCardioChange(i, 'type', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <input type="number" placeholder="Duration (min)" value={c.duration} onChange={e => handleCardioChange(i, 'duration', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <input type="number" placeholder="Distance (km)" value={c.distance} onChange={e => handleCardioChange(i, 'distance', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <button type="button" onClick={() => removeCardio(i)} className="text-red-500 hover:text-red-400 flex items-center justify-center p-2 rounded-lg bg-gray-600 hover:bg-gray-500"><Trash2 size={18}/></button>
                    </div>
                ))}
                <button type="button" onClick={addCardio} className="mt-2 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Cardio Activity</button>
            </div>

            {/* Weightlifting Section */}
            <div>
                <h3 className="text-lg font-semibold flex items-center text-cyan-400"><Dumbbell size={18} className="mr-2"/>Weightlifting</h3>
                <div className="space-y-4">
                {weights.map((ex, exIndex) => (
                    <div key={exIndex} className="bg-gray-700/50 p-4 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <input type="text" placeholder="Exercise Name (e.g. Bench Press)" value={ex.name} onChange={e => handleExerciseNameChange(exIndex, e.target.value)} className="flex-grow bg-gray-700 border-gray-600 rounded p-2 font-semibold" required />
                            <button type="button" onClick={() => removeWeightExercise(exIndex)} className="ml-4 text-red-500 hover:text-red-400"><Trash2 size={18}/></button>
                        </div>
                        {ex.sets.map((set, setIndex) => (
                            <div key={setIndex} className="grid grid-cols-4 gap-2 items-center ml-4">
                               <span className="text-gray-400 font-medium">Set {setIndex + 1}</span>
                               <input type="number" placeholder="Reps" value={set.reps} onChange={e => handleSetChange(exIndex, setIndex, 'reps', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required />
                               <input type="number" placeholder="Weight (lbs)" value={set.weight} onChange={e => handleSetChange(exIndex, setIndex, 'weight', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required />
                               <button type="button" onClick={() => removeSet(exIndex, setIndex)} className="text-red-500 hover:text-red-400"><X size={18}/></button>
                            </div>
                        ))}
                        <button type="button" onClick={() => addSet(exIndex)} className="ml-4 mt-2 text-cyan-400 hover:text-cyan-300 flex items-center text-sm"><Plus size={14} className="mr-1"/>Add Set</button>
                    </div>
                ))}
                </div>
                <button type="button" onClick={addWeightExercise} className="mt-4 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Weightlifting Exercise</button>
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
                <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Cancel</button>
                <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-lg">Save Workout</button>
            </div>
        </form>
    );
};

// --- Log Weight Form Component ---
const LogWeightForm = ({ onLogWeight, onCancel }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [weight, setWeight] = useState('');
    
    const handleSubmit = (e) => { 
        e.preventDefault(); 
        onLogWeight({ date, weight: parseFloat(weight) }); 
    };

    return ( 
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-2xl font-bold text-cyan-400">Log Your Weight</h2>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Weight (lbs)</label>
                <input type="number" step="0.1" placeholder="e.g., 165.5" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required />
            </div>
            <div className="flex justify-end space-x-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Cancel</button>
                <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded">Save Weight</button>
            </div>
        </form>
    );
};

