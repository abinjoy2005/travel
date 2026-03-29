from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import database
import bcrypt
import jwt
import os
import datetime
from functools import wraps
from engine import recommendation, mcts_selector, optimizer, planner
import psycopg2.errors

from werkzeug.utils import secure_filename
app = Flask(__name__)
# In production, set the SECRET_KEY environment variable. 
# You can generate one with: python -c 'import os; print(os.urandom(24).hex())'
app.secret_key = os.environ.get('SECRET_KEY', 'super_secret_temporary_key')

UPLOAD_FOLDER = os.path.join('static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Initialize DB on startup (ensure tables exist)
database.init_db()

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('token')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
            # You could query user here and attach it
        except Exception as e:
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def splash():
    session['allow_home'] = True
    return render_template('splash.html')

@app.route('/home')
def index():
    if not session.get('allow_home'):
        return redirect(url_for('splash'))
    session['allow_home'] = False # Consume the flag so refresh requires splash
    return render_template('index.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    token = request.cookies.get('token')
    if not token:
        return redirect(url_for('login_page'))
    try:
        data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
        conn = database.get_db_connection()
        c = conn.cursor(cursor_factory=database.RealDictCursor)
        c.execute('SELECT * FROM users WHERE user_id = %s', (data['user_id'],))
        user = c.fetchone()
        conn.close()
        if not user:
            return redirect(url_for('login_page'))
    except:
        return redirect(url_for('login_page'))
    
    # Check if a specific route section was requested
    route = request.args.get('route', 'welcome')

    return render_template('dashboard.html', user=user, route=route)

@app.route('/blog/<int:blog_id>')
def blog_detail(blog_id):
    # Ensure they are logged in if your app requires it for reading
    token = request.cookies.get('token')
    if not token:
        return redirect(url_for('login_page'))
    try:
        data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
        conn = database.get_db_connection()
        c = conn.cursor(cursor_factory=database.RealDictCursor)
        c.execute('SELECT * FROM users WHERE user_id = %s', (data['user_id'],))
        user = c.fetchone()
        conn.close()
        if not user:
            return redirect(url_for('login_page'))
    except:
        return redirect(url_for('login_page'))
        
    return render_template('blog_detail.html', user=user, blog_id=blog_id)

# API Endpoints
@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.json
    full_name = data.get('full_name')
    email = data.get('email')
    password = data.get('password')
    confirm_password = data.get('confirm_password')
    
    if not email or not password or not full_name or not confirm_password:
        return jsonify({'message': 'Please fill all fields'}), 400
        
    if password != confirm_password:
        return jsonify({'message': 'Passwords do not match'}), 400
        
    hashed_pwd = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    conn = database.get_db_connection()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s)', (full_name, email, hashed_pwd.decode('utf-8')))
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.close()
        return jsonify({'message': 'Email already registered'}), 400
    except Exception as e:
        conn.close()
        return jsonify({'message': f'Error: {str(e)}'}), 500
    conn.close()
    
    return jsonify({'message': 'Account created successfully'}), 201

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    conn = database.get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    c.execute('SELECT * FROM users WHERE email = %s', (email,))
    user = c.fetchone()
    conn.close()
    
    if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        token = jwt.encode({
            'user_id': user['user_id'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.secret_key, algorithm="HS256")
        
        resp = jsonify({'message': 'Logged in successfully'})
        resp.set_cookie('token', token, httponly=True)
        return resp
        
    return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    resp = jsonify({'message': 'Logged out'})
    resp.set_cookie('token', '', expires=0)
    return resp

# Main Engine Endpoints

def get_level_data(points):
    if points < 100:
        return {"level": 1, "title": "Explorer", "xp_min": 0, "xp_next": 100}
    elif points < 301:
        return {"level": 2, "title": "Pathfinder", "xp_min": 100, "xp_next": 300}
    elif points < 601:
        return {"level": 3, "title": "Voyager", "xp_min": 300, "xp_next": 600}
    elif points < 1001:
        return {"level": 4, "title": "Pro", "xp_min": 600, "xp_next": 1000}
    else:
        return {"level": 5, "title": "Elite", "xp_min": 1000, "xp_next": 5000}

def add_xp_to_user(user_id, amount):
    try:
        conn = database.get_db_connection()
        c = conn.cursor()
        c.execute('UPDATE users SET points = points + %s WHERE user_id = %s', (amount, user_id))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"XP Error: {str(e)}")


def get_guide_contacts(destination):
    # Mock database for guides across common Kerala destinations
    guides_db = {
        "munnar": [
            {"name": "Anandhu K.", "phone": "+91 94470 12345", "specialty": "Trekking & Tea Gardens"},
            {"name": "Manoj Varkala", "phone": "+91 98460 67890", "specialty": "Local History & Flora"}
        ],
        "cochin": [
            {"name": "Siddharth S.", "phone": "+91 70123 45678", "specialty": "Fort Kochi & Jewish Town"},
            {"name": "Faisal R.", "phone": "+91 99950 11223", "specialty": "Harbor Cruises & Food"}
        ],
        "alleppey": [
            {"name": "Jose Tom", "phone": "+91 94460 55443", "specialty": "Houseboat & Backwaters"},
            {"name": "Ramesh P.", "phone": "+91 98950 33445", "specialty": "Village Tours"}
        ],
        "wayanad": [
            {"name": "Biju Kurian", "phone": "+91 94472 88990", "specialty": "Cave Exploration & Wildlife"},
            {"name": "Sajeev M.", "phone": "+91 97450 66778", "specialty": "Tribal Heritage"}
        ]
    }
    
    dest_lower = destination.lower()
    for city, guides in guides_db.items():
        if city in dest_lower:
            return guides
            
    # Default guides if destination not specific enough
    return [
        {"name": "General Travel Desk", "phone": "+91 1800 425 4747", "specialty": "Kerala Tourism Info"},
        {"name": "Local Help Line", "phone": "100", "specialty": "Emergency Assistance"}
    ]

# --- Emergency Helpers ---
NATIONAL_HELPLINES = [
    {"dept": "All-in-One Emergency", "phone": "112"},
    {"dept": "Police", "phone": "100"},
    {"dept": "Fire", "phone": "101"},
    {"dept": "Ambulance", "phone": "102"},
    {"dept": "Disaster Management", "phone": "108"},
    {"dept": "Health Helpline", "phone": "104"},
    {"dept": "Women Helpline", "phone": "1091"},
    {"dept": "Domestic Abuse", "phone": "181"},
    {"dept": "Child Abuse Hotline", "phone": "1098"},
    {"dept": "Highway Emergency", "phone": "1033"},
    {"dept": "Railway Enquiry", "phone": "139"}
]

@app.route('/api/generate-itinerary', methods=['POST'])
@token_required
def generate_itinerary():
    data = request.json
    origin = data.get("origin", "Unknown").strip()
    destination = data.get("destination", "").strip()
    arrival_date = data.get("arrival_date", datetime.datetime.now().strftime("%m-%d-%Y"))
    budget = float(data.get("budget", 0))
    duration = int(data.get("duration", 1))
    style = data.get("style", "moderate")
    transport = data.get("transport", "car")
    age = int(data.get("age", 30))
    interests = data.get("interests", [])
    cuisine_preferences = data.get("cuisine_preferences", [])
    has_children = data.get("children", False)
    need_guides = data.get("guides", False)
    disability_info = data.get("disability_info", "").strip()
    guide_preferences = data.get("guide_preferences", "").strip()

    try:
        from model.model.crew import TravelCrew
        user_id = jwt.decode(request.cookies.get('token'), app.secret_key, algorithms=["HS256"])['user_id']
        add_xp_to_user(user_id, 25) # Planning a trip

        
        inputs = {
            'origin': origin,
            'destination': destination,
            'arrival_date': arrival_date,
            'age': age,
            'trip_duration': duration,
            'interests': interests,
            'cuisine_preferences': cuisine_preferences,
            'children': has_children,
            'budget': budget,
            'disability_info': disability_info,
            'guide_preferences': guide_preferences
        }

        # Initialize and kickoff the crew
        crew_instance = TravelCrew().crew()
        result = crew_instance.kickoff(inputs=inputs)
        
        itinerary_data = result.to_dict() if hasattr(result, 'to_dict') else result

        # Map to the format the frontend expects
        formatted_days = []
        for day in itinerary_data.get('days', []):
            route = []
            for act in day.get('activities', []):
                route.append({
                    'time': act.get('time', '09:00'),
                    'place': act.get('name', 'Unknown'),
                    'rating': act.get('rating', 4.0),
                    'cost': act.get('cost', 0.0),
                    'reviews': [act.get('description', '')]
                })
            formatted_days.append({
                'day_number': day.get('day_number', 1),
                'route': route
            })

        final_plan = {
            'destination': destination,
            'budget': budget,
            'total_cost': itinerary_data.get('total_cost', budget),
            'days': formatted_days
        }

        # Add Stay & Intercity Travel Recommendation
        best_stay = recommendation.get_best_stay(destination, user_prefs=data)
        if best_stay:
            final_plan['stay'] = {
                'name': best_stay['stay_name'],
                'price': round(float(best_stay['avg_price']), 2),
                'rating': round(float(best_stay['avg_rating']), 1)
            }
            
        intercity = recommendation.get_best_intercity_travel(origin, destination)
        if intercity:
            final_plan['intercity_travel'] = {
                'method': intercity['travel_method'],
                'cost': round(float(intercity['avg_cost']), 2),
                'rating': round(float(intercity['avg_rating']), 1)
            }

        # --- Add Guides & Emergency if Requested ---
        if need_guides:
            final_plan['guide_contacts'] = get_guide_contacts(destination)
        
        # Always include national helplines if requested or by default
        final_plan['national_helplines'] = NATIONAL_HELPLINES

        return jsonify(final_plan)

    except Exception as e:
        print(f"CrewAI Error: {str(e)}")
        # Fallback to existing manual logic if CrewAI fails
        print("Falling back to manual engine logic...")
        
        try:
            # 1. Recommendation (Fetch Community Data with personalized scoring)
            all_attractions = recommendation.get_top_attractions(destination, user_prefs=data)
            
            if not all_attractions:
                return jsonify({
                    'message': f'No community data found for "{destination}" yet. To enable AI generation for new cities, please ensure your SambaNova and Serper API keys are set in the environment.'
                }), 404

            # 2. MCTS (Select Attractions based on budget & rating)
            selected = mcts_selector.select_best_attractions(all_attractions, budget, duration=duration)

            if not selected:
                return jsonify({'message': 'Could not select attractions within the specified budget. Try increasing your budget.'}), 400

            # 3. Fast TSP/LKH (Optimize Route)
            optimized_route = optimizer.solve_tsp_2opt(selected)

            # 4. Time Planner & Format
            # Attach distances to route
            for i in range(len(optimized_route)):
                if i > 0:
                    dist = recommendation.get_avg_distance(optimized_route[i-1]['place_name'], optimized_route[i]['place_name'])
                    optimized_route[i]['distance_to_prev'] = dist
                else:
                    optimized_route[i]['distance_to_prev'] = 0.0

            city_transport_cost = recommendation.get_avg_transport_cost(destination, transport)
            final_plan = planner.build_itinerary(optimized_route, duration=duration, transport=transport, avg_travel_cost=city_transport_cost)
            
            # 5. Add Stay & Intercity Travel Recommendation
            best_stay = recommendation.get_best_stay(destination, user_prefs=data)
            if best_stay:
                final_plan['stay'] = {
                    'name': best_stay['stay_name'],
                    'price': round(float(best_stay['avg_price']), 2),
                    'rating': round(float(best_stay['avg_rating']), 1)
                }
                
            intercity = recommendation.get_best_intercity_travel(origin, destination)
            if intercity:
                final_plan['intercity_travel'] = {
                    'method': intercity['travel_method'],
                    'cost': round(float(intercity['avg_cost']), 2),
                    'rating': round(float(intercity['avg_rating']), 1)
                }
            
            # --- Add Guides & Emergency if Requested ---
            if need_guides:
                final_plan['guide_contacts'] = get_guide_contacts(destination)
            
            final_plan['national_helplines'] = NATIONAL_HELPLINES
            final_plan['destination'] = destination
            final_plan['budget'] = budget

            return jsonify(final_plan)
        except Exception as fallback_error:
            print(f"Fallback Error: {str(fallback_error)}")
            return jsonify({'message': f'Failed to generate itinerary for "{destination}". Technical error: {str(fallback_error)}'}), 500

@app.route('/api/experiences', methods=['POST'])
@token_required
def submit_experience():
    data = request.json
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    try:
        conn = database.get_db_connection()
        c = conn.cursor()
        
        # 1. Save the main trip experience row
        c.execute('''
            INSERT INTO trip_experiences 
            (user_id, origin, destination, trip_date, age, companion_type, has_children, interests, cuisine_preferences, trip_duration, main_transport, travel_style, stay_name, stay_price, stay_rating, total_expense, guide_name, guide_phone, guide_specialty, emergency_ambulance, emergency_police, emergency_health, accessibility_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING trip_id
        ''', (
            user_id, data.get('origin'), data.get('destination'), data.get('trip_date'), 
            data.get('age'), data.get('companion_type'), data.get('has_children', False),
            ",".join(data.get('interests', [])), ",".join(data.get('cuisine_preferences', [])),
            data.get('trip_duration'), data.get('main_transport'), data.get('travel_style'),
            data.get('stay_name'), data.get('stay_price', 0), data.get('stay_rating'), data.get('total_expense', 0),
            data.get('guide_name'), data.get('guide_phone'), data.get('guide_specialty'),
            data.get('emergency_ambulance'), data.get('emergency_police'), data.get('emergency_health'),
            data.get('accessibility_notes', '')
        ))
        
        trip_id = c.fetchone()[0]
        
        # 2. Save each place visited
        places = data.get('places', [])
        for idx, place in enumerate(places):
            c.execute('''
                INSERT INTO places_visited (trip_id, place_order, place_name, place_rating, entry_fee, distance_from_prev, travel_method, travel_cost, travel_rating, experience_review)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                trip_id, idx, place.get('place_name'), place.get('place_rating'), place.get('entry_fee', 0),
                place.get('distance_from_prev'), place.get('travel_method'), place.get('travel_cost'), place.get('travel_rating'),
                place.get('experience_review')
            ))
            
        conn.commit()
        conn.close()
        add_xp_to_user(user_id, 50) # Logging past trip
        return jsonify({'message': 'Trip Experience Logged Successfully!'}), 201

    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error saving experience: {str(e)}")
        return jsonify({'message': f'Error saving experience: {str(e)}'}), 500

@app.route('/api/my-trips', methods=['GET'])
@token_required
def get_my_trips():
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    conn = database.get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    # Fetch all trips for the user
    c.execute('SELECT * FROM trip_experiences WHERE user_id = %s ORDER BY trip_id DESC', (user_id,))
    trips = c.fetchall()
    
    results = []
    for trip in trips:
        trip_dict = dict(trip)
        # Fetch places for each trip
        c.execute('SELECT * FROM places_visited WHERE trip_id = %s ORDER BY place_order ASC', (trip['trip_id'],))
        places = c.fetchall()
        trip_dict['places'] = [dict(p) for p in places]
        results.append(trip_dict)
        
    conn.close()
    return jsonify(results)

# --- Blog Section API Endpoints ---

@app.route('/api/blogs', methods=['GET'])
def get_blogs():
    conn = database.get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    # Fetch all blogs with author full name
    c.execute('''
        SELECT b.*, u.full_name as author_name, 
               (SELECT COUNT(*) FROM blog_likes WHERE blog_id = b.blog_id) as likes_count,
               (SELECT COUNT(*) FROM blog_comments WHERE blog_id = b.blog_id) as comments_count
        FROM blogs b
        JOIN users u ON b.user_id = u.user_id
        ORDER BY b.created_at DESC
    ''')
    blogs = c.fetchall()
    
    results = []
    for blog in blogs:
        blog_dict = dict(blog)
        # Convert datetime to string for JSON serialization
        if blog_dict['created_at']:
            blog_dict['created_at'] = blog_dict['created_at'].strftime('%Y-%m-%d %H:%M')
            
        # Fetch images for the blog
        c.execute('SELECT image_url FROM blog_images WHERE blog_id = %s', (blog['blog_id'],))
        images = [row['image_url'] for row in c.fetchall()]
        blog_dict['images'] = images
        
        # Check if the current user liked it (if token exists)
        liked_by_me = False
        token = request.cookies.get('token')
        if token:
            try:
                user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
                user_id = user_data['user_id']
                c.execute('SELECT 1 FROM blog_likes WHERE blog_id = %s AND user_id = %s', (blog['blog_id'], user_id))
                if c.fetchone():
                    liked_by_me = True
            except:
                pass
        blog_dict['liked_by_me'] = liked_by_me
        results.append(blog_dict)
        
    conn.close()
    return jsonify(results)

@app.route('/api/blogs/<int:blog_id>', methods=['GET'])
def get_single_blog(blog_id):
    conn = database.get_db_connection()
    
    # Check if logged in to see if user liked it
    token = request.cookies.get('token')
    user_id = None
    if token:
        try:
            user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
            user_id = user_data['user_id']
        except:
            pass

    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    # Get blog
    c.execute('''
        SELECT b.*, u.full_name as author_name, 
               (SELECT COUNT(*) FROM blog_likes WHERE blog_id = b.blog_id) as likes_count,
               (SELECT COUNT(*) FROM blog_comments WHERE blog_id = b.blog_id) as comments_count
        FROM blogs b
        JOIN users u ON b.user_id = u.user_id
        WHERE b.blog_id = %s
    ''', (blog_id,))
    blog = c.fetchone()
    
    if not blog:
        conn.close()
        return jsonify({'message': 'Blog not found'}), 404
        
    bd = dict(blog)
    if bd['created_at']:
        bd['created_at'] = bd['created_at'].strftime('%Y-%m-%d %H:%M')
        
    # Get Images
    c.execute('SELECT image_url FROM blog_images WHERE blog_id = %s ORDER BY image_id ASC', (blog_id,))
    images = c.fetchall()
    bd['images'] = [img['image_url'] for img in images]
    
    # Check if current user liked it
    bd['liked_by_me'] = False
    if user_id:
        c.execute('SELECT 1 FROM blog_likes WHERE blog_id = %s AND user_id = %s', (blog_id, user_id))
        if c.fetchone():
            bd['liked_by_me'] = True
            
    conn.close()
    return jsonify(bd)

@app.route('/api/blogs', methods=['POST'])
@token_required
def create_blog():
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    title = request.form.get('title')
    content = request.form.get('content')
    short_description = request.form.get('short_description', '')
    category = request.form.get('category', 'General')
    
    if not title or not content:
        return jsonify({'message': 'Title and content are required'}), 400
        
    conn = database.get_db_connection()
    c = conn.cursor()
    try:
        c.execute('''
            INSERT INTO blogs (user_id, title, content, short_description, category)
            VALUES (%s, %s, %s, %s, %s) RETURNING blog_id
        ''', (user_id, title, content, short_description, category))
        blog_id = c.fetchone()[0]
        
        # Handle file uploads
        uploaded_files = request.files.getlist("images")
        for file in uploaded_files:
            if file.filename != '':
                filename = secure_filename(f"{blog_id}_{file.filename}")
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                image_url = f"/static/uploads/{filename}"
                c.execute('INSERT INTO blog_images (blog_id, image_url) VALUES (%s, %s)', (blog_id, image_url))
                
        conn.commit()
        add_xp_to_user(user_id, 100) # Writing blog
    except Exception as e:

        conn.rollback()
        conn.close()
        return jsonify({'message': f'Error creating blog: {str(e)}'}), 500
        
    conn.close()
    return jsonify({'message': 'Blog created successfully!', 'blog_id': blog_id}), 201

@app.route('/api/blogs/<int:blog_id>', methods=['DELETE'])
@token_required
def delete_blog(blog_id):
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    conn = database.get_db_connection()
    c = conn.cursor()
    
    # Check ownership
    c.execute('SELECT user_id FROM blogs WHERE blog_id = %s', (blog_id,))
    blog = c.fetchone()
    if not blog:
        conn.close()
        return jsonify({'message': 'Blog not found'}), 404
    if blog[0] != user_id:
        conn.close()
        return jsonify({'message': 'Unauthorized to delete this blog'}), 403
        
    try:
        c.execute('DELETE FROM blogs WHERE blog_id = %s', (blog_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'message': f'Error deleting blog: {str(e)}'}), 500
        
    conn.close()
    return jsonify({'message': 'Blog deleted successfully'})

@app.route('/api/blogs/<int:blog_id>/like', methods=['POST'])
@token_required
def toggle_like(blog_id):
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    conn = database.get_db_connection()
    c = conn.cursor()
    
    # Check if already liked
    c.execute('SELECT 1 FROM blog_likes WHERE blog_id = %s AND user_id = %s', (blog_id, user_id))
    already_liked = c.fetchone()
    
    try:
        if already_liked:
            c.execute('DELETE FROM blog_likes WHERE blog_id = %s AND user_id = %s', (blog_id, user_id))
            action = 'unliked'
        else:
            c.execute('INSERT INTO blog_likes (blog_id, user_id) VALUES (%s, %s)', (blog_id, user_id))
            action = 'liked'
            add_xp_to_user(user_id, 5) # Liking blog

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'message': f'Error toggling like: {str(e)}'}), 500
        
    # Get new like count
    c.execute('SELECT COUNT(*) FROM blog_likes WHERE blog_id = %s', (blog_id,))
    count = c.fetchone()[0]
    
    conn.close()
    return jsonify({'message': f'Blog {action}', 'action': action, 'likes_count': count})

@app.route('/api/blogs/<int:blog_id>/comments', methods=['GET', 'POST'])
def manage_comments(blog_id):
    conn = database.get_db_connection()
    
    if request.method == 'POST':
        # Need auth for posting comment
        token = request.cookies.get('token')
        if not token:
            conn.close()
            return jsonify({'message': 'Authentication required'}), 401
            
        try:
            user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
            user_id = user_data['user_id']
        except:
            conn.close()
            return jsonify({'message': 'Invalid token'}), 401
            
        data = request.json
        comment_text = data.get('comment_text')
        if not comment_text:
            conn.close()
            return jsonify({'message': 'Comment text required'}), 400
            
        c = conn.cursor()
        try:
            c.execute('INSERT INTO blog_comments (blog_id, user_id, comment_text) VALUES (%s, %s, %s)', 
                      (blog_id, user_id, comment_text))
            conn.commit()
        except Exception as e:
            conn.rollback()
            conn.close()
            return jsonify({'message': str(e)}), 500
            
    # GET: return all comments for the blog
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    c.execute('''
        SELECT bc.*, u.full_name as author_name 
        FROM blog_comments bc
        JOIN users u ON bc.user_id = u.user_id
        WHERE bc.blog_id = %s
        ORDER BY bc.created_at ASC
    ''', (blog_id,))
    
    comments = c.fetchall()
    results = []
    for comment in comments:
        cd = dict(comment)
        if cd['created_at']:
            cd['created_at'] = cd['created_at'].strftime('%Y-%m-%d %H:%M')
        results.append(cd)
        
    conn.close()
    return jsonify(results)

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile():
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    conn = database.get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    c.execute('SELECT full_name, email, points, achievements, headline, bio, location, profile_pic, cover_pic, disability_info FROM users WHERE user_id = %s', (user_id,))
    user = c.fetchone()
    
    # Also fetch travel stats
    c.execute('SELECT COUNT(*) as total_trips, SUM(total_expense) as total_spent FROM trip_experiences WHERE user_id = %s', (user_id,))
    stats = c.fetchone()
    
    conn.close()
    
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    level_info = get_level_data(user['points'])
    
    return jsonify({
        'full_name': user['full_name'],
        'email': user['email'],
        'points': user['points'],
        'achievements': user['achievements'].split(',') if user['achievements'] else [],
        'level': level_info,
        'headline': user['headline'],
        'bio': user['bio'],
        'location': user['location'],
        'profile_pic': user['profile_pic'],
        'cover_pic': user['cover_pic'],
        'disability_info': user['disability_info'],
        'stats': {
            'total_trips': stats['total_trips'],
            'total_spent': round(float(stats['total_spent'] or 0), 2)
        }
    })

@app.route('/api/user/profile', methods=['PATCH'])
@token_required
def update_user_profile():
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    data = request.json
    headline = data.get('headline')
    bio = data.get('bio')
    location = data.get('location')
    disability_info = data.get('disability_info')
    
    conn = database.get_db_connection()
    c = conn.cursor()
    try:
        c.execute('''
            UPDATE users 
            SET headline = COALESCE(%s, headline), 
                bio = COALESCE(%s, bio), 
                location = COALESCE(%s, location),
                disability_info = COALESCE(%s, disability_info)
            WHERE user_id = %s
        ''', (headline, bio, location, disability_info, user_id))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Profile updated successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'message': str(e)}), 500

@app.route('/api/user/profile/upload', methods=['POST'])
@token_required
def upload_profile_image():
    token = request.cookies.get('token')
    user_data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
    user_id = user_data['user_id']
    
    image_type = request.form.get('type') # 'profile' or 'cover'
    if image_type not in ['profile', 'cover']:
        return jsonify({'message': 'Invalid image type'}), 400
        
    file = request.files.get('image')
    if not file or file.filename == '':
        return jsonify({'message': 'No file uploaded'}), 400
        
    filename = secure_filename(f"user_{user_id}_{image_type}_{file.filename}")
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)
    image_url = f"/static/uploads/{filename}"
    
    column = 'profile_pic' if image_type == 'profile' else 'cover_pic'
    
    conn = database.get_db_connection()
    c = conn.cursor()
    try:
        c.execute(f'UPDATE users SET {column} = %s WHERE user_id = %s', (image_url, user_id))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Image uploaded successfully', 'url': image_url})
    except Exception as e:
        conn.close()
        return jsonify({'message': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
