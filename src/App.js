/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Plus, Dumbbell, Zap, Weight, LogOut, BrainCircuit, X, Edit, ChevronRight, ChevronDown, BookCopy, FilePlus, Sparkles } from 'lucide-react';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [appId, setAppId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [configError, setConfigError] = useState(false);
    
    const [workouts, setWorkouts] = useState([]);
    const [workoutPlans, setWorkoutPlans] = useState([]);
    const [weightLog, setWeightLog] = useState([]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [view, setView] = useState('dashboard');
    const [loadingData, setLoadingData] = useState(true);
    const [editingWorkout, setEditingWorkout] = useState(null);
    const [editingPlan, setEditingPlan] = useState(null);
    const [prefilledWorkout, setPrefilledWorkout] = useState(null);


    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        const initializeForProduction = async () => {
            let finalConfig;
            try {
                const response = await fetch('/__/firebase/init.json');
                if (response.ok) {
                    finalConfig = await response.json();
                } else { throw new Error("Not on Firebase Hosting."); }
            } catch (e) {
                finalConfig = {
                    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
                    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
                    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
                    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
                    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
                    appId: process.env.REACT_APP_FIREBASE_APP_ID,
                };
            }

            if (finalConfig && finalConfig.apiKey && finalConfig.projectId) {
                try {
                    const app = initializeApp(finalConfig);
                    const authInstance = getAuth(app);
                    setAuth(authInstance);
                    setDb(getFirestore(app));
                    setAppId(finalConfig.appId);
                    
                    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                        setUser(user);
                        setIsAuthReady(true);
                        setLoadingData(!!user);
                    });
                     return () => unsubscribe();
                } catch (initError) { setConfigError(true); }
            } else { setConfigError(true); }
        };

        if (typeof __firebase_config !== 'undefined' && typeof __initial_auth_token !== 'undefined') {
             try {
                const devConfig = JSON.parse(__firebase_config);
                const app = initializeApp(devConfig);
                const authInstance = getAuth(app);
                setAuth(authInstance);
                setDb(getFirestore(app));
                setAppId(devConfig.appId);

                const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                    if (user) { setUser(user); } else { await signInWithCustomToken(authInstance, __initial_auth_token); }
                    setIsAuthReady(true);
                });
                return () => unsubscribe();
            } catch (devError) { setConfigError(true); }
        } else {
            initializeForProduction();
        }
    }, []);

    // --- Data Fetching for Authenticated User ---
    useEffect(() => {
        if (!isAuthReady || !db || !user || !appId) {
            setWorkouts([]);
            setWeightLog([]);
            setWorkoutPlans([]);
            if(isAuthReady && !user) setLoadingData(false);
            return;
        }
        
        setLoadingData(true);
        const basePath = `/artifacts/${appId}/users/${user.uid}`;

        const unsubWorkouts = onSnapshot(query(collection(db, `${basePath}/workouts`)), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => new Date(b.date) - new Date(a.date));
            setWorkouts(data);
            setLoadingData(false);
        });

        const unsubWeightLog = onSnapshot(query(collection(db, `${basePath}/weightLog`)), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => new Date(b.date) - new Date(a.date));
            setWeightLog(data);
        });
        
        const unsubPlans = onSnapshot(query(collection(db, `${basePath}/workout_plans`)), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWorkoutPlans(data);
        });

        return () => { unsubWorkouts(); unsubWeightLog(); unsubPlans(); };
    }, [isAuthReady, db, user, appId]);
    
     // --- Calculate Most Recent Weight ---
    useEffect(() => {
        const allEntries = [
            ...weightLog.filter(l => l.weight && l.date).map(l => ({ date: l.date, weight: l.weight })),
            ...workouts.filter(w => w.currentWeight && w.date).map(w => ({ date: w.date, weight: w.currentWeight }))
        ];
        if (allEntries.length > 0) {
            allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
            setCurrentWeight(allEntries[0].weight);
        } else { setCurrentWeight(''); }
    }, [workouts, weightLog]);
    
    // --- Group Workouts by Date ---
    const groupedWorkouts = useMemo(() => {
        const groups = workouts.reduce((acc, workout) => {
            if (!acc[workout.date]) { acc[workout.date] = []; }
            acc[workout.date].push(workout);
            return acc;
        }, {});

        return Object.entries(groups).map(([date, activities]) => ({ date, activities })).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [workouts]);

    // --- Auth Functions ---
    const signInWithGoogle = async () => { if (auth) await signInWithPopup(auth, new GoogleAuthProvider()).catch(e => console.error(e)); };
    const handleSignOut = async () => { if (auth) await signOut(auth).catch(e => console.error(e)); };

    // --- Data Handlers ---
    const getCollectionPath = (subPath) => `/artifacts/${appId}/users/${user.uid}/${subPath}`;
    const handleAddWorkout = async (w) => { await addDoc(collection(db, getCollectionPath('workouts')), w); setView('dashboard'); setPrefilledWorkout(null); };
    const handleUpdateWorkout = async (id, data) => { await updateDoc(doc(db, getCollectionPath('workouts'), id), data); setView('dashboard'); setEditingWorkout(null); };
    const handleLogWeight = async (w) => { await addDoc(collection(db, getCollectionPath('weightLog')), w); setView('dashboard'); };
    const handleDeleteWorkout = async (id) => await deleteDoc(doc(db, getCollectionPath('workouts'), id));
    
    // Plan Handlers
    const handleSavePlan = async (plan) => { await addDoc(collection(db, getCollectionPath('workout_plans')), plan); setView('managePlans'); };
    const handleUpdatePlan = async (id, data) => { await updateDoc(doc(db, getCollectionPath('workout_plans'), id), data); setView('managePlans'); setEditingPlan(null); };
    const handleDeletePlan = async (id) => await deleteDoc(doc(db, getCollectionPath('workout_plans'), id));

    const startEditWorkout = (w) => { setEditingWorkout(w); setView('editWorkout'); };
    const startEditPlan = (p) => { setEditingPlan(p); setView('editPlan'); };
    const startWorkoutFromPlan = (plan) => { setPrefilledWorkout(plan); setView('addWorkoutFromPlan'); };

    // --- Render Logic ---
    if (configError) return <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white text-center p-4"><X className="w-16 h-16 text-red-500 mb-4" /><h2 className="text-2xl font-bold mb-2">Configuration Error</h2><p className="max-w-md">Failed to initialize Firebase. Please check your hosting setup and environment variables.</p></div>;
    if (!isAuthReady) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Dumbbell className="w-16 h-16 animate-spin mx-auto text-cyan-400" /><p className="mt-4 text-lg">Connecting...</p></div>;
    if (!user) return <LoginScreen onSignIn={signInWithGoogle} />;
    
    const renderView = () => {
        if (loadingData) return <div className="flex items-center justify-center h-64"><Dumbbell className="w-12 h-12 animate-spin text-cyan-400" /></div>;
        switch (view) {
            case 'addWorkoutSelection': return <AddWorkoutSelection plans={workoutPlans} onSelectPlan={startWorkoutFromPlan} setView={setView} />;
            case 'addWorkout': return <WorkoutForm onSave={handleAddWorkout} onCancel={() => setView('dashboard')} />;
            case 'addWorkoutFromPlan': return <WorkoutForm onSave={handleAddWorkout} onCancel={() => setView('dashboard')} existingWorkout={prefilledWorkout} isFromPlan={true} />;
            case 'editWorkout': return <WorkoutForm onSave={(data) => handleUpdateWorkout(editingWorkout.id, data)} onCancel={() => { setView('dashboard'); setEditingWorkout(null); }} existingWorkout={editingWorkout} />;
            case 'logWeight': return <LogWeightForm onLogWeight={handleLogWeight} onCancel={() => setView('dashboard')} />;
            case 'managePlans': return <ManagePlansView plans={workoutPlans} setView={setView} onEdit={startEditPlan} onDelete={handleDeletePlan} />;
            case 'createPlan': return <PlanEditorForm onSave={handleSavePlan} onCancel={() => setView('managePlans')} />;
            case 'editPlan': return <PlanEditorForm onSave={(data) => handleUpdatePlan(editingPlan.id, data)} onCancel={() => setView('managePlans')} existingPlan={editingPlan} />;
            default: return <Dashboard workouts={groupedWorkouts} totalWorkoutsCount={workouts.length} currentWeight={currentWeight} setView={setView} onDeleteWorkout={handleDeleteWorkout} onEditWorkout={startEditWorkout} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <header className="bg-gray-800 shadow-lg p-4 sticky top-0 z-10"><div className="container mx-auto max-w-4xl flex justify-between items-center"><h1 className="text-2xl font-bold text-cyan-400 flex items-center"><Dumbbell className="mr-3" />FitTrack</h1><div className="flex items-center space-x-4"><img src={user.photoURL || `https://placehold.co/40x40/475569/E0E7FF?text=${user.displayName ? user.displayName.charAt(0) : 'U'}`} alt="User profile" className="w-10 h-10 rounded-full border-2 border-cyan-400" /><span className="font-semibold text-white hidden sm:block">Hi, {user.displayName || 'User'}!</span><button onClick={handleSignOut} className="flex items-center text-gray-300 hover:text-cyan-400 transition-colors" title="Sign Out"><LogOut size={20}/></button></div></div></header>
            <main className="container mx-auto max-w-4xl p-4 md:p-6">{renderView()}</main>
            <footer className="text-center p-4 text-gray-500 text-xs"><p>Built with React & Firebase.</p></footer>
        </div>
    );
}

// --- Screens & Components ---

const LoginScreen = ({ onSignIn }) => (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="text-center"><Dumbbell className="w-20 h-20 text-cyan-400 mx-auto mb-4" /><h1 className="text-4xl font-bold mb-2">Welcome to FitTrack</h1><p className="text-gray-400 mb-8">Your personal fitness journey starts here.</p><button onClick={onSignIn} className="bg-white hover:bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"><svg className="w-6 h-6 mr-3" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>Sign in with Google</button></div>
    </div>
);

const Dashboard = ({ workouts, totalWorkoutsCount, currentWeight, setView, onDeleteWorkout, onEditWorkout }) => {
    const [openDays, setOpenDays] = useState({});
    useEffect(() => { if (workouts.length > 0) { setOpenDays({ [workouts[0].date]: true }); } }, [workouts]);
    const toggleDay = (date) => setOpenDays(prev => ({ ...prev, [date]: !prev[date] }));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center"><div><p className="text-gray-400 text-sm">Current Weight</p><p className="text-3xl font-bold">{currentWeight ? `${currentWeight} lbs` : 'N/A'}</p></div><Weight className="w-10 h-10 text-cyan-400" /></div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center"><div><p className="text-gray-400 text-sm">Total Logged Workouts</p><p className="text-3xl font-bold">{totalWorkoutsCount}</p></div><Dumbbell className="w-10 h-10 text-cyan-400" /></div>
            </div>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button onClick={() => setView('addWorkoutSelection')} className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"><Plus className="mr-2" /> Add Workout</button>
                <button onClick={() => setView('managePlans')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"><BookCopy className="mr-2" /> Manage Plans</button>
            </div>
            <div><h2 className="text-xl font-bold mb-4 text-cyan-400">Workout History</h2><div className="space-y-4">{workouts.length > 0 ? (workouts.map(day => <DailyWorkoutCard key={day.date} day={day} isOpen={!!openDays[day.date]} onToggle={() => toggleDay(day.date)} onDelete={onDeleteWorkout} onEdit={onEditWorkout} />)) : (<p className="text-gray-400 text-center py-8">No workouts logged yet. Add one to get started!</p>)}</div></div>
        </div>
    );
};

const DailyWorkoutCard = ({ day, isOpen, onToggle, onDelete, onEdit }) => {
    const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const allCardio = useMemo(() => day.activities.flatMap(a => (a.cardio || []).map(c => ({...c, activityId: a.id, parentActivity: a}))), [day.activities]);
    const allWeights = useMemo(() => day.activities.flatMap(a => (a.weights || []).map(w => ({...w, activityId: a.id, parentActivity: a}))), [day.activities]);
    const bodyWeightEntry = useMemo(() => day.activities.find(a => a.currentWeight), [day.activities]);

    return (
        <div className="bg-gray-800 rounded-lg shadow-md hover:shadow-cyan-500/20 transition-shadow">
            <button onClick={onToggle} className="w-full flex justify-between items-center p-5 text-left"><h3 className="font-bold text-lg text-cyan-400">{formatDate(day.date)}</h3>{isOpen ? <ChevronDown size={24} /> : <ChevronRight size={24} />}</button>
            {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-700 pt-4">
                    {bodyWeightEntry && (<div className="flex items-center text-gray-300 text-sm mb-2 font-semibold"><Weight size={14} className="mr-2"/><span>Body Weight: {bodyWeightEntry.currentWeight} lbs</span></div>)}
                    {allCardio.length > 0 && (<div><h4 className="font-semibold flex items-center text-yellow-400 mb-2"><Zap size={16} className="mr-2"/>Cardio</h4><ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">{allCardio.map((c, i) => <li key={i}>{c.type}: {c.duration} mins, {c.distance} miles</li>)}</ul></div>)}
                    {allWeights.length > 0 && (<div><h4 className="font-semibold flex items-center text-cyan-400 mb-2"><Dumbbell size={16} className="mr-2"/>Weightlifting</h4><div className="space-y-3">{allWeights.map((exercise, i) => (<div key={i}><p className="font-semibold text-gray-200">{exercise.name}</p><ul className="text-sm text-gray-400 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 mt-1 ml-4">{exercise.sets.map((set, j) => <li key={j} className="flex items-center"><ChevronRight size={12} className="mr-1" />{set.reps} reps @ {set.weight} lbs</li>)}</ul></div>))}</div></div>)}
                    <div className="flex items-center justify-end space-x-2 mt-2 pt-2 border-t border-gray-600"><button onClick={() => onEdit(day.activities[0])} className="text-gray-400 hover:text-cyan-400 p-1 text-xs flex items-center"><Edit size={14} className="mr-1"/> Edit Day</button><button onClick={() => day.activities.forEach(a => onDelete(a.id))} className="text-gray-400 hover:text-red-400 p-1 text-xs flex items-center"><Trash2 size={14} className="mr-1"/> Delete Day</button></div>
                </div>
            )}
        </div>
    );
};

const AddWorkoutSelection = ({ plans, setView, onSelectPlan }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-cyan-400 mb-6">How would you like to add a workout?</h2>
        <div className="space-y-4">
            <button onClick={() => setView('addWorkout')} className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-4 rounded-lg flex items-center justify-center text-lg"><FilePlus className="mr-3"/>Log a New Manual Workout</button>
            <div>
                <h3 className="text-xl font-semibold text-gray-300 my-4 text-center">Or Start from a Plan</h3>
                {plans.length > 0 ? plans.map(plan => (
                    <button key={plan.id} onClick={() => onSelectPlan(plan)} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-between mb-2">
                        <span>{plan.name}</span>
                        <ChevronRight/>
                    </button>
                )) : <p className="text-center text-gray-400">You have no saved plans. Go to "Manage Plans" to create one.</p>}
            </div>
        </div>
         <button onClick={() => setView('dashboard')} className="mt-6 text-cyan-400 hover:text-cyan-300">← Back to Dashboard</button>
    </div>
);

const ManagePlansView = ({ plans, setView, onEdit, onDelete }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-cyan-400">Your Workout Plans</h2>
            <button onClick={() => setView('createPlan')} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg flex items-center"><Plus className="mr-2"/>Create Plan</button>
        </div>
        <div className="space-y-3">
            {plans.length > 0 ? plans.map(plan => (
                <div key={plan.id} className="bg-gray-700 p-4 rounded-lg flex justify-between items-center">
                    <span className="font-semibold text-lg">{plan.name}</span>
                    <div className="flex space-x-2">
                        <button onClick={() => onEdit(plan)} className="p-2 text-gray-300 hover:text-cyan-400"><Edit/></button>
                        <button onClick={() => onDelete(plan.id)} className="p-2 text-gray-300 hover:text-red-400"><Trash2/></button>
                    </div>
                </div>
            )) : <p className="text-center text-gray-400 py-8">You haven't created any workout plans yet.</p>}
        </div>
        <button onClick={() => setView('dashboard')} className="mt-6 text-cyan-400 hover:text-cyan-300">← Back to Dashboard</button>
    </div>
);

const PlanEditorForm = ({ onSave, onCancel, existingPlan = null }) => {
    const [name, setName] = useState('');
    const [cardio, setCardio] = useState([]);
    const [weights, setWeights] = useState([]);

    useEffect(() => {
        if (existingPlan) {
            setName(existingPlan.name || '');
            setCardio(existingPlan.cardio || []);
            setWeights(existingPlan.weights || []);
        }
    }, [existingPlan]);

    const addCardio = () => setCardio([...cardio, { type: '', duration: '', distance: '' }]);
    const removeCardio = (i) => setCardio(cardio.filter((_, idx) => idx !== i));
    const handleCardioChange = (i, f, v) => { const u = [...cardio]; u[i][f] = v; setCardio(u); };

    const addWeightExercise = () => setWeights([...weights, { name: '', sets: [{ reps: '', weight: '' }] }]);
    const removeWeightExercise = (exIdx) => setWeights(weights.filter((_, i) => i !== exIdx));
    const handleExerciseNameChange = (exIdx, v) => { const u = [...weights]; u[exIdx].name = v; setWeights(u); };
    const addSet = (exIdx) => { const u = [...weights]; const last = u[exIdx].sets[u[exIdx].sets.length - 1] || {reps:'', weight:''}; u[exIdx].sets.push({...last}); setWeights(u); };
    const removeSet = (exIdx, sIdx) => { const u = [...weights]; u[exIdx].sets = u[exIdx].sets.filter((_, i) => i !== sIdx); setWeights(u); };
    const handleSetChange = (exIdx, sIdx, f, v) => { const u = [...weights]; u[exIdx].sets[sIdx][f] = v; setWeights(u); };

    const handleSubmit = (e) => { e.preventDefault(); onSave({ name, cardio, weights }); };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400">{existingPlan ? 'Edit Plan' : 'Create New Plan'}</h2>
            <div><label className="block text-sm font-medium text-gray-300 mb-1">Plan Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Push Day A" className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required /></div>
            <div><h3 className="text-lg font-semibold flex items-center text-yellow-400"><Zap size={18} className="mr-2"/>Cardio Exercises</h3>{cardio.map((c, i) => (<div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2 p-3 bg-gray-700/50 rounded-lg"><input type="text" placeholder="Activity" value={c.type} onChange={e => handleCardioChange(i, 'type', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><input type="number" placeholder="Duration (min)" value={c.duration} onChange={e => handleCardioChange(i, 'duration', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><input type="number" placeholder="Distance (miles)" value={c.distance} onChange={e => handleCardioChange(i, 'distance', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><button type="button" onClick={() => removeCardio(i)} className="text-red-500 hover:text-red-400 flex items-center justify-center p-2 rounded-lg bg-gray-600 hover:bg-gray-500"><Trash2 size={18}/></button></div>))}<button type="button" onClick={addCardio} className="mt-2 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Cardio</button></div>
            <div><h3 className="text-lg font-semibold flex items-center text-cyan-400"><Dumbbell size={18} className="mr-2"/>Weightlifting Exercises</h3><div className="space-y-4">{weights.map((ex, exIdx) => (<div key={exIdx} className="bg-gray-700/50 p-4 rounded-lg space-y-3"><div className="flex items-center justify-between"><input type="text" placeholder="Exercise Name" value={ex.name} onChange={e => handleExerciseNameChange(exIdx, e.target.value)} className="flex-grow bg-gray-700 border-gray-600 rounded p-2 font-semibold" required /><button type="button" onClick={() => removeWeightExercise(exIdx)} className="ml-4 text-red-500 hover:text-red-400"><Trash2 size={18}/></button></div>{ex.sets.map((set, setIndex) => (<div key={setIndex} className="grid grid-cols-4 gap-2 items-center ml-4"><span className="text-gray-400 font-medium">Set {setIndex + 1}</span><input type="number" placeholder="Reps" value={set.reps} onChange={e => handleSetChange(exIdx, setIndex, 'reps', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required /><input type="number" placeholder="Weight (lbs)" value={set.weight} onChange={e => handleSetChange(exIdx, setIndex, 'weight', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required /><button type="button" onClick={() => removeSet(exIdx, setIndex)} className="text-red-500 hover:text-red-400"><X size={18}/></button></div>))}<button type="button" onClick={() => addSet(exIdx)} className="ml-4 mt-2 text-cyan-400 hover:text-cyan-300 flex items-center text-sm"><Plus size={14} className="mr-1"/>Add Set</button></div>))}<button type="button" onClick={addWeightExercise} className="mt-4 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Exercise</button></div></div>
            <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700"><button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Cancel</button><button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-lg">Save Plan</button></div>
        </form>
    );
};

// --- Workout Form ---
const WorkoutForm = ({ onSave, onCancel, existingWorkout = null, isFromPlan = false }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [cardio, setCardio] = useState([]);
    const [weights, setWeights] = useState([]);

    useEffect(() => {
        if (existingWorkout) {
            if(!isFromPlan) setDate(existingWorkout.date || new Date().toISOString().split('T')[0]);
            setCurrentWeight(existingWorkout.currentWeight || '');
            setCardio(existingWorkout.cardio || []);
            setWeights(existingWorkout.weights || []);
        }
    }, [existingWorkout, isFromPlan]);

    const addCardio = () => setCardio([...cardio, { type: '', duration: '', distance: '' }]);
    const removeCardio = (i) => setCardio(cardio.filter((_, idx) => idx !== i));
    const handleCardioChange = (i, f, v) => { const u = [...cardio]; u[i][f] = v; setCardio(u); };

    const addWeightExercise = () => setWeights([...weights, { name: '', sets: [{ reps: '', weight: '' }] }]);
    const removeWeightExercise = (exIdx) => setWeights(weights.filter((_, i) => i !== exIdx));
    const handleExerciseNameChange = (exIdx, v) => { const u = [...weights]; u[exIdx].name = v; setWeights(u); };
    const addSet = (exIdx) => { const u = [...weights]; const last = u[exIdx].sets[u[exIdx].sets.length - 1] || {reps:'', weight:''}; u[exIdx].sets.push({...last}); setWeights(u); };
    const removeSet = (exIdx, sIdx) => { const u = [...weights]; u[exIdx].sets = u[exIdx].sets.filter((_, i) => i !== sIdx); setWeights(u); };
    const handleSetChange = (exIdx, sIdx, f, v) => { const u = [...weights]; u[exIdx].sets[sIdx][f] = v; setWeights(u); };

    const handleSubmit = (e) => { e.preventDefault(); onSave({ date, currentWeight, cardio, weights }); };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400">{existingWorkout ? 'Edit Workout' : 'Add New Workout'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-300 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required /></div><div><label className="block text-sm font-medium text-gray-300 mb-1">Your Weight (lbs) <span className="text-gray-500">(Optional)</span></label><input type="number" step="0.1" placeholder="e.g., 165.5" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" /></div></div>
            <div><h3 className="text-lg font-semibold flex items-center text-yellow-400"><Zap size={18} className="mr-2"/>Cardio</h3>{cardio.map((c, i) => (<div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2 p-3 bg-gray-700/50 rounded-lg"><input type="text" placeholder="Activity" value={c.type} onChange={e => handleCardioChange(i, 'type', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><input type="number" placeholder="Duration (min)" value={c.duration} onChange={e => handleCardioChange(i, 'duration', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><input type="number" placeholder="Distance (miles)" value={c.distance} onChange={e => handleCardioChange(i, 'distance', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required /><button type="button" onClick={() => removeCardio(i)} className="text-red-500 hover:text-red-400 flex items-center justify-center p-2 rounded-lg bg-gray-600 hover:bg-gray-500"><Trash2 size={18}/></button></div>))}<button type="button" onClick={addCardio} className="mt-2 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Cardio</button></div>
            <div><h3 className="text-lg font-semibold flex items-center text-cyan-400"><Dumbbell size={18} className="mr-2"/>Weightlifting</h3><div className="space-y-4">{weights.map((ex, exIdx) => (<div key={exIdx} className="bg-gray-700/50 p-4 rounded-lg space-y-3"><div className="flex items-center justify-between"><input type="text" placeholder="Exercise Name" value={ex.name} onChange={e => handleExerciseNameChange(exIdx, e.target.value)} className="flex-grow bg-gray-700 border-gray-600 rounded p-2 font-semibold" required /><button type="button" onClick={() => removeWeightExercise(exIdx)} className="ml-4 text-red-500 hover:text-red-400"><Trash2 size={18}/></button></div>{ex.sets.map((set, setIndex) => (<div key={setIndex} className="grid grid-cols-4 gap-2 items-center ml-4"><span className="text-gray-400 font-medium">Set {setIndex + 1}</span><input type="number" placeholder="Reps" value={set.reps} onChange={e => handleSetChange(exIdx, setIndex, 'reps', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required /><input type="number" placeholder="Weight (lbs)" value={set.weight} onChange={e => handleSetChange(exIdx, setIndex, 'weight', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required /><button type="button" onClick={() => removeSet(exIdx, setIndex)} className="text-red-500 hover:text-red-400"><X size={18}/></button></div>))}<button type="button" onClick={() => addSet(exIdx)} className="ml-4 mt-2 text-cyan-400 hover:text-cyan-300 flex items-center text-sm"><Plus size={14} className="mr-1"/>Add Set</button></div>))}<button type="button" onClick={addWeightExercise} className="mt-4 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Exercise</button></div></div>
            <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700"><button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Cancel</button><button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-lg">Save Workout</button></div>
        </form>
    );
};

// --- Log Weight Form Component ---
const LogWeightForm = ({ onLogWeight, onCancel }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [weight, setWeight] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onLogWeight({ date, weight: parseFloat(weight) }); };
    return (<form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4"><h2 className="text-2xl font-bold text-cyan-400">Log Your Weight</h2><div><label className="block text-sm font-medium text-gray-300 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required /></div><div><label className="block text-sm font-medium text-gray-300 mb-1">Weight (lbs)</label><input type="number" step="0.1" placeholder="e.g., 165.5" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required /></div><div className="flex justify-end space-x-4"><button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Cancel</button><button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded">Save Weight</button></div></form>);
};
