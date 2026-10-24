import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

const govNavy = Color(0xFF0F172A);
const govBlue = Color(0xFF1D4ED8);
const govSaffron = Color(0xFFD97706);
const pageBackground = Color(0xFFF1F5F9);
const govBorder = Color(0xFFE2E8F0);

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3001',
);

void main() {
  runApp(const PunarvasanApp());
}

class PunarvasanApp extends StatelessWidget {
  const PunarvasanApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Punarvasan Tracker',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: govBlue,
          primary: govBlue,
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: pageBackground,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: govNavy,
          elevation: 0,
          surfaceTintColor: Colors.white,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 1,
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: govBorder),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 13,
            vertical: 13,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: govBlue, width: 1.5),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: govBlue,
            foregroundColor: Colors.white,
            minimumSize: const Size(48, 46),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(6),
            ),
          ),
        ),
        textTheme: ThemeData.light().textTheme.apply(
          bodyColor: govNavy,
          displayColor: govNavy,
        ),
        useMaterial3: true,
      ),
      home: const AuthPage(),
    );
  }
}

class ApiClient {
  ApiClient([http.Client? client]) : _client = client ?? http.Client();

  final http.Client _client;

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    String? token,
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$apiBaseUrl$path');
    final headers = <String, String>{'Accept': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    if (body != null) headers['Content-Type'] = 'application/json';

    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed = await _client.send(request);
    final response = await http.Response.fromStream(streamed);
    Map<String, dynamic> data = {};
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) data = decoded;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        data['error'] ?? 'Request failed (${response.statusCode}).',
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> get(String path, {String? token}) =>
      request('GET', path, token: token);

  Future<Map<String, dynamic>> post(
    String path, {
    String? token,
    required Map<String, dynamic> body,
  }) => request('POST', path, token: token, body: body);

  Future<Map<String, dynamic>> patch(
    String path, {
    String? token,
    required Map<String, dynamic> body,
  }) => request('PATCH', path, token: token, body: body);
}

class AppSession {
  const AppSession({
    required this.token,
    required this.role,
    required this.mobile,
    required this.name,
  });

  final String token;
  final String role;
  final String mobile;
  final String name;

  factory AppSession.fromJson(Map<String, dynamic> json) => AppSession(
    token: json['token'] as String,
    role: json['user']['role'] as String,
    mobile: json['user']['mobile'] as String,
    name: json['user']['name'] as String,
  );
}

const roles = <String, String>{
  'resident': 'Resident',
  'contractor': 'Contractor',
  'government': 'Government / SRA Officer',
};

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _api = ApiClient();
  final _name = TextEditingController();
  final _mobile = TextEditingController();
  final _password = TextEditingController();
  final _projectId = TextEditingController(text: 'PUN-23-101');
  final _unit = TextEditingController();
  final _company = TextEditingController();
  final _license = TextEditingController();
  final _gst = TextEditingController();
  final _department = TextEditingController(
    text: 'Slum Rehabilitation Authority (SRA)',
  );
  final _designation = TextEditingController();
  final _aadhaar = TextEditingController();
  final _household = TextEditingController();
  final _ward = TextEditingController();
  final _plot = TextEditingController();
  final _otp = TextEditingController();
  List<Map<String, dynamic>> _publicProjects = [];
  String? _registrationProject;
  String _role = 'resident';
  bool _registering = false;
  bool _otpMode = false;
  bool _otpRequested = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPublicProjects();
  }

  Future<void> _loadPublicProjects() async {
    try {
      final result = await _api.get('/api/public-projects');
      if (!mounted) return;
      setState(() {
        _publicProjects = _maps(result['projects']);
        _registrationProject ??= _publicProjects.isEmpty
            ? null
            : '${_publicProjects.first['id']}';
      });
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  Widget _textField(
    TextEditingController controller,
    String label, {
    TextInputType? keyboardType,
    bool obscureText = false,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: govNavy,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: obscureText && !_showPassword,
            textCapitalization: textCapitalization,
            decoration: InputDecoration(
              hintText: label == 'Mobile Number'
                  ? '10-digit number (e.g. 8828390911)'
                  : label == 'Password'
                  ? 'Enter your password'
                  : null,
              suffixIcon: obscureText
                  ? IconButton(
                      tooltip: _showPassword
                          ? 'Hide password'
                          : 'Show password',
                      onPressed: () =>
                          setState(() => _showPassword = !_showPassword),
                      icon: Icon(
                        _showPassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 18,
                      ),
                    )
                  : null,
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _mobile.dispose();
    _password.dispose();
    _projectId.dispose();
    _unit.dispose();
    _company.dispose();
    _license.dispose();
    _gst.dispose();
    _department.dispose();
    _designation.dispose();
    _aadhaar.dispose();
    _household.dispose();
    _ward.dispose();
    _plot.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      late final Map<String, dynamic> result;
      if (_registering) {
        result = await _api.post(
          '/api/auth/register',
          body: <String, dynamic>{
            'role': _role,
            'name': _name.text.trim(),
            'mobile': _mobile.text.trim(),
            'password': _password.text,
            if (_role == 'resident') ...{
              'projectId': _registrationProject ?? _projectId.text.trim(),
              'unit': _unit.text.trim(),
              'aadhaarNumber': _aadhaar.text.trim(),
              'householdNumber': _household.text.trim(),
              'wardNumber': _ward.text.trim(),
              'plotNumber': _plot.text.trim(),
            },
            if (_role == 'contractor') ...{
              'projectId': _registrationProject ?? _projectId.text.trim(),
              'companyName': _company.text.trim(),
              'licenseNumber': _license.text.trim(),
              'gstNumber': _gst.text.trim(),
            },
            if (_role == 'government') ...{
              'department': _department.text.trim(),
              'designation': _designation.text.trim(),
            },
          },
        );
      } else if (_otpMode) {
        if (!_otpRequested) {
          await _api.post(
            '/api/auth/request-otp',
            body: {'role': _role, 'mobile': _mobile.text.trim()},
          );
          if (mounted) setState(() => _otpRequested = true);
          return;
        }
        result = await _api.post(
          '/api/auth/verify-otp',
          body: {
            'role': _role,
            'mobile': _mobile.text.trim(),
            'code': _otp.text.trim(),
          },
        );
      } else {
        result = await _api.post(
          '/api/auth/login',
          body: {
            'role': _role,
            'mobile': _mobile.text.trim(),
            'password': _password.text,
          },
        );
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) =>
              DashboardPage(api: _api, session: AppSession.fromJson(result)),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const _TricolorRibbon(),
          Expanded(
            child: CustomPaint(
              painter: _GridPainter(),
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 490),
                    child: Column(
                      children: [
                        _masthead(),
                        const SizedBox(height: 16),
                        Card(
                          elevation: 8,
                          shadowColor: const Color(0x160F172A),
                          child: Padding(
                            padding: const EdgeInsets.all(22),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _authTabs(),
                                const SizedBox(height: 20),
                                Text(
                                  _registering
                                      ? 'Create an Account'
                                      : 'Welcome Back',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: govNavy,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _registering
                                      ? 'Select your role and complete your profile for redevelopment tracking'
                                      : 'Sign in with your mobile number and password',
                                  style: const TextStyle(
                                    color: Color(0xFF475569),
                                    fontSize: 12,
                                  ),
                                ),
                                const Padding(
                                  padding: EdgeInsets.only(top: 14, bottom: 14),
                                  child: Divider(height: 1, color: govBorder),
                                ),
                                _roleSelector(),
                                if (_registering)
                                  _textField(
                                    _name,
                                    'Full Name',
                                    textCapitalization:
                                        TextCapitalization.words,
                                  ),
                                _textField(
                                  _mobile,
                                  'Mobile Number',
                                  keyboardType: TextInputType.phone,
                                ),
                                if (_registering) _registrationFields(),
                                if (!_otpMode || _registering)
                                  _textField(
                                    _password,
                                    'Password',
                                    obscureText: true,
                                  ),
                                if (_otpMode && !_registering && _otpRequested)
                                  _textField(
                                    _otp,
                                    '6-digit verification code',
                                    keyboardType: TextInputType.number,
                                  ),
                                if (_error != null) ...[
                                  const SizedBox(height: 12),
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFEF2F2),
                                      border: Border.all(
                                        color: const Color(0xFFFECACA),
                                      ),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      _error!,
                                      style: const TextStyle(
                                        color: Color(0xFF991B1B),
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 14),
                                FilledButton(
                                  onPressed: _busy ? null : _submit,
                                  child: _busy
                                      ? const SizedBox(
                                          height: 18,
                                          width: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : Text(
                                          _registering
                                              ? 'Complete Registration & Sign In'
                                              : _otpMode
                                              ? (_otpRequested
                                                    ? 'Verify Code'
                                                    : 'Send Verification Code')
                                              : 'Sign In   →',
                                        ),
                                ),
                                const SizedBox(height: 8),
                                if (_registering)
                                  TextButton(
                                    onPressed: () => _switchMode(false),
                                    child: const Text(
                                      'Already have an account? Sign In',
                                    ),
                                  )
                                else
                                  Wrap(
                                    alignment: WrapAlignment.center,
                                    crossAxisAlignment:
                                        WrapCrossAlignment.center,
                                    children: [
                                      const Text(
                                        "Don't have an account yet? ",
                                        style: TextStyle(
                                          color: Color(0xFF64748B),
                                          fontSize: 12,
                                        ),
                                      ),
                                      TextButton(
                                        onPressed: () => _switchMode(true),
                                        style: TextButton.styleFrom(
                                          padding: EdgeInsets.zero,
                                          minimumSize: Size.zero,
                                          tapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap,
                                        ),
                                        child: const Text(
                                          'Register here',
                                          style: TextStyle(
                                            fontSize: 12,
                                            decoration:
                                                TextDecoration.underline,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                if (!_registering)
                                  TextButton(
                                    onPressed: () => setState(() {
                                      _otpMode = !_otpMode;
                                      _otpRequested = false;
                                      _error = null;
                                    }),
                                    child: Text(
                                      _otpMode
                                          ? 'Use password instead'
                                          : 'Sign in with OTP',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'SRA / MHADA / DRP Pilot — Ward-level Transparency Initiative',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _masthead() => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: govSaffron, width: 1.5),
        ),
        child: const Icon(Icons.account_balance, color: govBlue, size: 23),
      ),
      const SizedBox(width: 12),
      const Flexible(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'GOVERNMENT OF MAHARASHTRA • महाराष्ट्र शासन',
              style: TextStyle(
                color: govSaffron,
                fontSize: 9,
                letterSpacing: 0.3,
                fontWeight: FontWeight.w800,
              ),
            ),
            SizedBox(height: 3),
            Text(
              'Punarvasan Portal • पुनर्वसन',
              style: TextStyle(
                color: govNavy,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              'Slum Rehabilitation Authority (SRA) & MHADA Monitoring System',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 9),
            ),
          ],
        ),
      ),
    ],
  );

  Widget _authTabs() => Container(
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: pageBackground,
      border: Border.all(color: govBorder),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      children: [
        _authTab('Sign In', !_registering, () => _switchMode(false)),
        _authTab('Register New Account', _registering, () => _switchMode(true)),
      ],
    ),
  );

  Widget _authTab(String label, bool selected, VoidCallback onTap) => Expanded(
    child: InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 38),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: Color(0x140F172A),
                    blurRadius: 3,
                    offset: Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: selected ? govBlue : const Color(0xFF334155),
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    ),
  );

  Widget _roleSelector() {
    const roleIcons = {
      'resident': Icons.home,
      'contractor': Icons.construction,
      'government': Icons.account_balance,
    };
    const roleLabels = {
      'resident': 'Resident',
      'contractor': 'Contractor',
      'government': 'Govt / SRA',
    };
    return Row(
      children: roles.keys.map((role) {
        final selected = _role == role;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: role == 'government' ? 0 : 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => setState(() {
                _role = role;
                _otpRequested = false;
                _error = null;
              }),
              child: Container(
                height: 72,
                decoration: BoxDecoration(
                  color: selected
                      ? const Color(0xFFEFF6FF)
                      : const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: selected ? govBlue : govBorder,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      roleIcons[role],
                      color: selected ? govBlue : const Color(0xFF64748B),
                      size: 20,
                    ),
                    const SizedBox(height: 5),
                    Text(
                      roleLabels[role]!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: selected ? govBlue : const Color(0xFF334155),
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _registrationFields() {
    if (_role == 'government') {
      return Column(
        children: [
          _textField(_department, 'Government Department'),
          _textField(_designation, 'Designation / Role'),
        ],
      );
    }
    if (_role == 'resident') {
      return Column(
        children: [
          _projectDropdown('Assigned Project'),
          _textField(_unit, 'Unit / Flat'),
          _textField(
            _aadhaar,
            'Aadhaar Number (Optional)',
            keyboardType: TextInputType.number,
          ),
          _textField(_household, 'Household Number'),
          _textField(_ward, 'Ward Number'),
          _textField(_plot, 'Plot Number'),
        ],
      );
    }
    return Column(
      children: [
        _textField(_company, 'Company / Agency Name'),
        _projectDropdown('Assigned Project'),
        _textField(_license, 'PWD / SRA License Number'),
        _textField(_gst, 'GST Number (Optional)'),
      ],
    );
  }

  Widget _projectDropdown(String label) {
    if (_publicProjects.isEmpty) {
      return _textField(_projectId, '$label ID');
    }
    final current =
        _publicProjects.any(
          (project) => '${project['id']}' == _registrationProject,
        )
        ? _registrationProject
        : '${_publicProjects.first['id']}';
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: DropdownButtonFormField<String>(
        initialValue: current,
        decoration: InputDecoration(labelText: label),
        items: _publicProjects
            .map(
              (project) => DropdownMenuItem(
                value: '${project['id']}',
                child: Text(
                  '${project['name'] ?? project['id']}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            )
            .toList(),
        onChanged: (value) => setState(() => _registrationProject = value),
      ),
    );
  }

  void _switchMode(bool registering) {
    setState(() {
      _registering = registering;
      _otpMode = false;
      _otpRequested = false;
      _error = null;
    });
    if (registering && _publicProjects.isEmpty) _loadPublicProjects();
  }
}

class _TricolorRibbon extends StatelessWidget {
  const _TricolorRibbon();

  @override
  Widget build(BuildContext context) => const SizedBox(
    height: 4,
    child: Row(
      children: [
        Expanded(child: ColoredBox(color: Color(0xFFFF9933))),
        Expanded(child: ColoredBox(color: Colors.white)),
        Expanded(child: ColoredBox(color: Color(0xFF138808))),
      ],
    ),
  );
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const gap = 28.0;
    final paint = Paint()
      ..color = const Color(0x080F172A)
      ..strokeWidth = 0.6;
    for (double x = 0; x <= size.width; x += gap) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y <= size.height; y += gap) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api, required this.session});

  final ApiClient api;
  final AppSession session;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _featureItems = [];
  List<Map<String, dynamic>> _notifications = [];
  List<Map<String, dynamic>> _progressUpdates = [];
  List<Map<String, dynamic>> _complaints = [];
  String? _selectedFeature;
  String? _error;
  bool _busy = false;

  String get _token => widget.session.token;
  List<_Feature> get _features {
    switch (widget.session.role) {
      case 'resident':
        return const [
          _Feature('Dashboard', 'dashboard'),
          _Feature('My Project', 'my-project'),
          _Feature('Progress Timeline', 'timeline'),
          _Feature('My Complaints', 'complaints'),
          _Feature('Government Notices', 'notices'),
          _Feature('Notifications', 'notifications'),
        ];
      case 'contractor':
        return const [
          _Feature('Dashboard', 'dashboard'),
          _Feature('My Project', 'projects'),
          _Feature('Daily Report', 'daily-report'),
          _Feature('Submit Progress', 'submit-progress'),
          _Feature('My Updates', 'my-updates'),
          _Feature('Notifications', 'notifications'),
        ];
      default:
        return const [
          _Feature('Dashboard', 'dashboard'),
          _Feature('All Projects', 'projects'),
          _Feature('Review Queue', 'progress-queue'),
          _Feature('Verification Queue', 'verification-queue'),
          _Feature('Complaints', 'complaints-gov'),
          _Feature('Reports & Analytics', 'reports'),
          _Feature('Notifications', 'notifications'),
        ];
    }
  }

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    await _loadProjects();
    try {
      final requests = <Future<Map<String, dynamic>>>[
        widget.api.get('/api/notifications', token: _token),
      ];
      if (widget.session.role == 'contractor') {
        requests.add(widget.api.get('/api/daily-reports', token: _token));
      }
      if (widget.session.role == 'government') {
        requests.add(widget.api.get('/api/government/progress', token: _token));
      }
      if (widget.session.role == 'government' ||
          widget.session.role == 'resident') {
        requests.add(widget.api.get('/api/complaints', token: _token));
      }
      final responses = await Future.wait(requests);
      if (!mounted) return;
      setState(() {
        _notifications = _maps(responses.first['notifications']);
        var index = 1;
        if (widget.session.role == 'contractor') {
          _featureItems = _maps(responses[index++]['reports']);
        }
        if (widget.session.role == 'government') {
          _progressUpdates = _maps(responses[index++]['updates']);
        }
        if (widget.session.role == 'government' ||
            widget.session.role == 'resident') {
          _complaints = _maps(responses[index]['complaints']);
        }
      });
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  Future<void> _loadProjects() async {
    try {
      final result = await widget.api.get('/api/projects', token: _token);
      if (!mounted) return;
      setState(() {
        _projects = _maps(result['projects']);
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  String _pathForFeature(String feature) {
    switch (feature) {
      case 'complaints':
      case 'complaints-gov':
        return '/api/complaints';
      case 'notices':
        return '/api/notices';
      case 'notifications':
        return '/api/notifications';
      case 'daily-report':
      case 'daily-reports':
        return '/api/daily-reports';
      case 'progress-queue':
      case 'government-progress':
        return '/api/government/progress';
      case 'verification-queue':
        return '/api/admin/queue';
      case 'reports':
        return '/api/reports';
      default:
        return '';
    }
  }

  Future<void> _openFeature(String feature) async {
    setState(() {
      _selectedFeature = feature == 'dashboard' ? null : feature;
      _featureItems = [];
      _busy = true;
      _error = null;
    });
    if (feature == 'dashboard') {
      await _loadDashboardData();
      if (mounted) setState(() => _busy = false);
      return;
    }
    if (feature == 'projects' || feature == 'my-project') {
      await _loadProjects();
      setState(() => _busy = false);
      return;
    }
    try {
      if (feature == 'timeline' || feature == 'my-updates') {
        final updates = <Map<String, dynamic>>[];
        for (final project in _projects) {
          final id = Uri.encodeComponent('${project['id']}');
          final data = await widget.api.get(
            '/api/projects/$id/progress',
            token: _token,
          );
          updates.addAll(_maps(data['updates']));
        }
        updates.sort(
          (left, right) =>
              '${right['created_at']}'.compareTo('${left['created_at']}'),
        );
        if (mounted) setState(() => _featureItems = updates);
      } else {
        final data = await widget.api.get(
          _pathForFeature(feature),
          token: _token,
        );
        final list = data.values.firstWhere(
          (value) => value is List,
          orElse: () => const [],
        );
        if (mounted) setState(() => _featureItems = _maps(list));
      }
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    try {
      await widget.api.post('/api/auth/logout', token: _token, body: {});
    } catch (error) {
      debugPrint('API logout failed: ${_message(error)}');
    }
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AuthPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final feature = _selectedFeature;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: govSaffron),
                color: Colors.white,
              ),
              child: const Icon(
                Icons.account_balance,
                color: govBlue,
                size: 18,
              ),
            ),
            const SizedBox(width: 9),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'PUNARVASAN',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.3,
                  ),
                ),
                Text(
                  'SRA • MAHARASHTRA',
                  style: TextStyle(
                    color: govSaffron,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => _openFeature('notifications'),
            icon: Badge(
              isLabelVisible: _notifications.isNotEmpty,
              label: Text(
                _notifications.length > 9 ? '9+' : '${_notifications.length}',
              ),
              child: const Icon(Icons.notifications_none),
            ),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _busy
                ? null
                : () =>
                      feature == null ? _loadProjects() : _openFeature(feature),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1000),
          child: Column(
            children: [
              const _TricolorRibbon(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              if (_busy) const LinearProgressIndicator(),
              Expanded(
                child: feature == null
                    ? _home()
                    : feature == 'projects' || feature == 'my-project'
                    ? _projectList()
                    : feature == 'daily-report'
                    ? _dailyReports()
                    : feature == 'submit-progress'
                    ? _contractorProgress()
                    : _featureView(feature),
              ),
            ],
          ),
        ),
      ),
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              DrawerHeader(
                decoration: const BoxDecoration(color: Colors.white),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.account_balance, color: govBlue),
                        SizedBox(width: 8),
                        Text(
                          'PUNARVASAN',
                          style: TextStyle(
                            color: govNavy,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      widget.session.name,
                      style: const TextStyle(
                        color: govNavy,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${roles[widget.session.role]}',
                      style: const TextStyle(color: govBlue, fontSize: 12),
                    ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.home_outlined),
                title: const Text('Home'),
                selected: feature == null || feature == 'dashboard',
                onTap: () {
                  Navigator.pop(context);
                  _openFeature('dashboard');
                },
              ),
              ..._features.map(
                (item) => ListTile(
                  leading: Icon(_iconForFeature(item.id)),
                  title: Text(item.title),
                  selected: feature == item.id,
                  onTap: () {
                    Navigator.pop(context);
                    if (item.id == 'dashboard') {
                      _openFeature('dashboard');
                    } else {
                      _openFeature(item.id);
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _home() {
    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 28),
        children: [
          Text(
            widget.session.role == 'resident'
                ? 'Welcome back, ${widget.session.name.split(' ').first}'
                : widget.session.role == 'contractor'
                ? 'Contractor Dashboard'
                : 'Government / SRA Dashboard',
            style: const TextStyle(
              color: govNavy,
              fontSize: 21,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            widget.session.role == 'resident'
                ? "Track your building's construction progress"
                : '${widget.session.name} · ${widget.session.mobile}',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
          ),
          const SizedBox(height: 16),
          _statGrid(),
          if (widget.session.role == 'government') ...[
            if (_projects.any(_isDelayed)) _delayedBanner(),
            _mapCard(
              _projects,
              title: 'Geographic Project Map (Mumbai Metropolitan Region)',
            ),
            _governmentDashboardCards(),
          ] else if (widget.session.role == 'contractor') ...[
            _mapCard(
              _projects,
              title: 'Geographic Project Map (Assigned Construction Sites)',
            ),
            _sectionCard(
              title: 'Assigned Projects',
              trailing: TextButton(
                onPressed: () => _openFeature('projects'),
                child: const Text('View all'),
              ),
              child: Column(
                children: _projects.isEmpty
                    ? [_emptyMessage('No projects assigned')]
                    : _projects.map(_projectCard).toList(),
              ),
            ),
            _shortcutButtons([
              ('Daily Report', 'daily-report', Icons.assignment_outlined),
              ('Submit Progress', 'submit-progress', Icons.trending_up),
              ('My Updates', 'my-updates', Icons.timeline),
            ]),
          ] else if (_projects.isNotEmpty) ...[
            _residentProjectCard(_projects.first),
            _mapCard([
              _projects.first,
            ], title: 'Geographic Project Map (Site Location)'),
            if (_notifications.isNotEmpty) _recentNotifications(),
          ] else
            _emptyMessage(
              'No project linked. Contact your administrator to link your account.',
            ),
        ],
      ),
    );
  }

  Widget _statGrid() {
    final project = _projects.isEmpty ? null : _projects.first;
    final average = _projects.isEmpty
        ? 0
        : (_projects.fold<double>(
                    0,
                    (sum, item) =>
                        sum + ((item['progress'] as num?)?.toDouble() ?? 0),
                  ) /
                  _projects.length)
              .round();
    final pending = _progressUpdates
        .where(
          (item) =>
              item['status'] == 'Pending review' || item['status'] == 'Pending',
        )
        .length;
    final stats = widget.session.role == 'resident'
        ? [
            (
              '${project?['progress'] ?? '—'}%',
              'Construction Progress',
              Icons.construction,
              const Color(0xFF7C3AED),
              const Color(0xFFF5F3FF),
            ),
            (
              '${project?['unit'] ?? '—'}',
              'Your Unit',
              Icons.home,
              govBlue,
              const Color(0xFFEFF6FF),
            ),
            (
              '${_notifications.length}',
              'Notifications',
              Icons.notifications,
              govSaffron,
              const Color(0xFFFFFBEB),
            ),
            (
              _shortStage(project?['stage']),
              'Current Stage',
              Icons.assignment_outlined,
              const Color(0xFF059669),
              const Color(0xFFECFDF5),
            ),
          ]
        : widget.session.role == 'contractor'
        ? [
            (
              '${_projects.length}',
              'Assigned Projects',
              Icons.apartment,
              const Color(0xFF7C3AED),
              const Color(0xFFF5F3FF),
            ),
            (
              '${_featureItems.length}',
              'Daily Reports',
              Icons.description_outlined,
              govBlue,
              const Color(0xFFEFF6FF),
            ),
            (
              '$average%',
              'Avg Progress',
              Icons.trending_up,
              const Color(0xFF059669),
              const Color(0xFFECFDF5),
            ),
            (
              '${_notifications.length}',
              'Notifications',
              Icons.notifications,
              govSaffron,
              const Color(0xFFFFFBEB),
            ),
          ]
        : [
            (
              '${_projects.length}',
              'Total Projects',
              Icons.apartment,
              const Color(0xFF7C3AED),
              const Color(0xFFF5F3FF),
            ),
            (
              '$average%',
              'Avg Progress',
              Icons.trending_up,
              const Color(0xFF059669),
              const Color(0xFFECFDF5),
            ),
            (
              '$pending',
              'Pending Reviews',
              Icons.hourglass_top,
              govSaffron,
              const Color(0xFFFFFBEB),
            ),
            (
              '${_projects.fold<int>(0, (sum, item) => sum + ((item['families'] as num?)?.toInt() ?? 0))}',
              'Total Families',
              Icons.groups_outlined,
              govBlue,
              const Color(0xFFEFF6FF),
            ),
          ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = (constraints.maxWidth - 10) / 2;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: stats
              .map(
                (stat) => SizedBox(
                  width: width,
                  child: _statCard(stat.$1, stat.$2, stat.$3, stat.$4, stat.$5),
                ),
              )
              .toList(),
        );
      },
    );
  }

  Widget _statCard(
    String value,
    String label,
    IconData icon,
    Color color,
    Color background,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: color.withValues(alpha: 0.2)),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: govNavy,
                    ),
                  ),
                  Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _residentProjectCard(Map<String, dynamic> project) {
    final progress = (project['progress'] as num?)?.toDouble() ?? 0;
    return _sectionCard(
      title: '📍 ${project['name'] ?? 'My Project'}',
      trailing: _statusBadge('${project['status'] ?? 'In progress'}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${project['stage'] ?? 'Construction in progress'}',
            style: const TextStyle(fontSize: 14, color: govNavy),
          ),
          const SizedBox(height: 9),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress.clamp(0, 100) / 100,
                    minHeight: 7,
                    backgroundColor: const Color(0xFFE2E8F0),
                    color: const Color(0xFF059669),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${progress.toStringAsFixed(0)}%',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            '📌 ${project['ward'] ?? 'Mumbai'}   👪 ${project['families'] ?? 0} families',
            style: const TextStyle(fontSize: 11, color: Color(0xFF475569)),
          ),
          const SizedBox(height: 5),
          Text(
            '🏢 Contractor: ${project['contractor'] ?? '—'}',
            style: const TextStyle(fontSize: 11, color: Color(0xFF475569)),
          ),
          if (project['next_milestone'] != null) ...[
            const SizedBox(height: 6),
            Text(
              'Next milestone: ${project['next_milestone']}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
            ),
          ],
          if (_isDelayed(project)) ...[
            const SizedBox(height: 10),
            _alertStrip(
              'Project inactive for ${project['days_inactive'] ?? 30}+ days',
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              OutlinedButton.icon(
                onPressed: () => _openFeature('timeline'),
                icon: const Icon(Icons.timeline, size: 16),
                label: const Text('View Timeline'),
              ),
              OutlinedButton.icon(
                onPressed: () => _openFeature('complaints'),
                icon: const Icon(Icons.edit_note, size: 16),
                label: const Text('Submit Complaint'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _mapCard(
    List<Map<String, dynamic>> projects, {
    required String title,
  }) {
    final centerProject = projects.isEmpty ? null : projects.first;
    final center = _projectLocation(centerProject);
    final markers = projects.map((project) {
      final delayed = _isDelayed(project);
      return Marker(
        point: _projectLocation(project),
        width: 34,
        height: 34,
        child: Container(
          decoration: BoxDecoration(
            color: delayed ? const Color(0xFFDC2626) : const Color(0xFF059669),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: const [
              BoxShadow(color: Color(0x330F172A), blurRadius: 5),
            ],
          ),
          child: const Icon(Icons.apartment, color: Colors.white, size: 15),
        ),
      );
    }).toList();
    return _sectionCard(
      title: '🗺️ $title',
      subtitle: projects.length == 1
          ? 'Real-time project site location in ${projects.first['ward'] ?? 'Mumbai'}'
          : 'Project locations and construction status across your area',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          height: 250,
          child: Stack(
            children: [
              FlutterMap(
                options: MapOptions(initialCenter: center, initialZoom: 13),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.punarvasan.tracker',
                  ),
                  MarkerLayer(markers: markers),
                ],
              ),
              Positioned(
                right: 6,
                bottom: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 5,
                    vertical: 2,
                  ),
                  color: Colors.white.withValues(alpha: 0.85),
                  child: const Text(
                    '© OpenStreetMap contributors',
                    style: TextStyle(fontSize: 8, color: Color(0xFF334155)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _governmentDashboardCards() {
    final pending = _progressUpdates
        .where((item) => item['status'] == 'Pending review')
        .toList();
    final openComplaints = _complaints
        .where(
          (item) => item['status'] != 'Resolved' && item['status'] != 'Closed',
        )
        .toList();
    return Column(
      children: [
        _sectionCard(
          title: 'Project Status',
          trailing: TextButton(
            onPressed: () => _openFeature('projects'),
            child: const Text('View All'),
          ),
          child: Column(
            children: _projects.map((project) {
              final progress = (project['progress'] as num?)?.toDouble() ?? 0;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${project['name'] ?? project['id']}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${project['ward'] ?? ''} · ${project['scheme_type'] ?? 'SRA'} · ${progress.toStringAsFixed(0)}%',
                ),
                trailing: _statusBadge('${project['status'] ?? 'Monitoring'}'),
              );
            }).toList(),
          ),
        ),
        _sectionCard(
          title: 'Pending Reviews (${pending.length})',
          trailing: TextButton(
            onPressed: () => _openFeature('progress-queue'),
            child: const Text('Review All'),
          ),
          child: pending.isEmpty
              ? _emptyMessage('All progress reviews are complete.')
              : Column(
                  children: pending
                      .take(5)
                      .map(
                        (item) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(
                            Icons.pending_actions,
                            color: govSaffron,
                          ),
                          title: Text(
                            '${item['project_id']} · ${item['stage']}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text('Progress: ${item['progress']}%'),
                        ),
                      )
                      .toList(),
                ),
        ),
        _sectionCard(
          title: 'Open Complaints (${openComplaints.length})',
          trailing: TextButton(
            onPressed: () => _openFeature('complaints-gov'),
            child: const Text('View All'),
          ),
          child: openComplaints.isEmpty
              ? _emptyMessage('No open complaints.')
              : Column(
                  children: openComplaints
                      .take(5)
                      .map(
                        (item) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(
                            Icons.report_problem_outlined,
                            color: Color(0xFFDC2626),
                          ),
                          title: Text('${item['project_id']}'),
                          subtitle: Text(
                            '${item['issue'] ?? ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
      ],
    );
  }

  Widget _delayedBanner() {
    final delayed = _projects.where(_isDelayed).toList();
    return Card(
      color: const Color(0xFFFEF2F2),
      child: ListTile(
        leading: const Icon(Icons.warning_amber, color: Color(0xFFDC2626)),
        title: Text(
          '${delayed.length} project(s) inactive for 30+ days',
          style: const TextStyle(
            color: Color(0xFF991B1B),
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: Text(delayed.map((item) => '${item['name']}').join(' · ')),
        trailing: IconButton(
          tooltip: 'View delayed projects',
          onPressed: () => _openFeature('projects'),
          icon: const Icon(Icons.arrow_forward, color: Color(0xFFDC2626)),
        ),
      ),
    );
  }

  Widget _recentNotifications() => _sectionCard(
    title: 'Recent Notifications',
    trailing: TextButton(
      onPressed: () => _openFeature('notifications'),
      child: const Text('View all'),
    ),
    child: Column(
      children: _notifications
          .take(3)
          .map(
            (notification) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(radius: 5, backgroundColor: govBlue),
              title: Text('${notification['title'] ?? ''}'),
              subtitle: Text('${notification['message'] ?? ''}'),
            ),
          )
          .toList(),
    ),
  );

  Widget _sectionCard({
    required String title,
    required Widget child,
    String? subtitle,
    Widget? trailing,
  }) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: govNavy,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (subtitle != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(
                            subtitle,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 10,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                ?trailing,
              ],
            ),
          ),
          const Divider(height: 1, color: govBorder),
          Padding(padding: const EdgeInsets.all(12), child: child),
        ],
      ),
    );
  }

  Widget _shortcutButtons(List<(String, String, IconData)> shortcuts) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: shortcuts
        .map(
          (item) => OutlinedButton.icon(
            onPressed: () => _openFeature(item.$2),
            icon: Icon(item.$3, size: 17),
            label: Text(item.$1),
          ),
        )
        .toList(),
  );

  Widget _emptyMessage(String message) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Center(
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
      ),
    ),
  );

  Widget _alertStrip(String message) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    decoration: BoxDecoration(
      color: const Color(0xFFFEF2F2),
      border: Border.all(color: const Color(0xFFFECACA)),
      borderRadius: BorderRadius.circular(5),
    ),
    child: Row(
      children: [
        const Icon(Icons.warning_amber, size: 15, color: Color(0xFFDC2626)),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(color: Color(0xFF991B1B), fontSize: 11),
          ),
        ),
      ],
    ),
  );

  Widget _statusBadge(String status) {
    final isDelayed = status.toLowerCase().contains('delay');
    final isApproved = status.toLowerCase().contains('approved');
    final color = isDelayed
        ? const Color(0xFFDC2626)
        : isApproved
        ? const Color(0xFF059669)
        : govBlue;
    final background = isDelayed
        ? const Color(0xFFFEF2F2)
        : isApproved
        ? const Color(0xFFECFDF5)
        : const Color(0xFFEFF6FF);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        status,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  bool _isDelayed(Map<String, dynamic> project) =>
      project['is_delayed'] == true ||
      ((project['days_inactive'] as num?)?.toInt() ?? 0) >= 30;

  String _shortStage(dynamic value) =>
      (value?.toString().split('—').first ?? '—').split(',').first.trim();

  LatLng _projectLocation(Map<String, dynamic>? project) {
    final projectId = '${project?['id'] ?? ''}';
    final fallback = switch (projectId) {
      'PUN-23-101' => const LatLng(19.0607, 72.8525),
      'PUN-23-104' => const LatLng(19.0416, 72.8550),
      _ => const LatLng(19.0726, 72.8790),
    };
    final lat = (project?['latitude'] as num?)?.toDouble();
    final lng = (project?['longitude'] as num?)?.toDouble();
    return lat != null && lng != null ? LatLng(lat, lng) : fallback;
  }

  Widget _projectList() => RefreshIndicator(
    onRefresh: _loadProjects,
    child: _projects.isEmpty
        ? ListView(
            children: const [
              ListTile(
                title: Text('No projects are assigned to this account.'),
              ),
            ],
          )
        : ListView(
            padding: const EdgeInsets.all(12),
            children: _projects.map(_projectCard).toList(),
          ),
  );

  Widget _projectCard(Map<String, dynamic> project) {
    final progress = (project['progress'] as num?)?.toDouble() ?? 0;
    return Card(
      child: ListTile(
        title: Text('${project['name'] ?? project['id']}'),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${project['id']} · ${project['ward'] ?? ''}'),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: progress.clamp(0, 100) / 100),
            const SizedBox(height: 4),
            Text(
              '$progress% complete · ${project['stage'] ?? 'Status unavailable'}',
            ),
          ],
        ),
        isThreeLine: true,
        onTap: () => _showProjectProgress(project),
      ),
    );
  }

  Future<void> _showProjectProgress(Map<String, dynamic> project) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final id = Uri.encodeComponent('${project['id']}');
      final data = await widget.api.get(
        '/api/projects/$id/progress',
        token: _token,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('${project['name'] ?? project['id']} progress'),
          content: SizedBox(
            width: 480,
            child: _maps(data['updates']).isEmpty
                ? const Text('No progress updates are available yet.')
                : ListView(
                    shrinkWrap: true,
                    children: _maps(data['updates']).map(_dataCard).toList(),
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _featureView(String feature) {
    final title = _features.firstWhere((item) => item.id == feature).title;
    if (_busy && _featureItems.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    final items = _featureItems;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (feature == 'complaints' && widget.session.role == 'resident')
                FilledButton.icon(
                  onPressed: _projects.isEmpty ? null : _newComplaint,
                  icon: const Icon(Icons.add),
                  label: const Text('New'),
                ),
              if (feature == 'daily-report' &&
                  widget.session.role == 'contractor')
                FilledButton.icon(
                  onPressed: _projects.isEmpty ? null : _newDailyReport,
                  icon: const Icon(Icons.add),
                  label: const Text('New'),
                ),
            ],
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? ListView(
                  children: const [
                    ListTile(title: Text('Nothing to show yet.')),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.all(12),
                  children: items
                      .map((item) => _actionableDataCard(feature, item))
                      .toList(),
                ),
        ),
      ],
    );
  }

  Widget _actionableDataCard(String feature, Map<String, dynamic> item) {
    final actions = <Widget>[];
    if ((feature == 'progress-queue' || feature == 'government-progress') &&
        (item['status'] == 'Pending' || item['status'] == 'Pending review')) {
      actions.addAll([
        TextButton(
          onPressed: () => _decideProgress(item, 'Rejected'),
          child: const Text('Return'),
        ),
        FilledButton(
          onPressed: () => _decideProgress(item, 'Approved'),
          child: const Text('Approve'),
        ),
      ]);
    }
    if ((feature == 'complaints-gov' || feature == 'complaints') &&
        widget.session.role == 'government') {
      actions.add(
        TextButton(
          onPressed: () => _updateComplaint(item),
          child: const Text('Update status'),
        ),
      );
    }
    return _dataCard(item, actions: actions);
  }

  Widget _contractorProgress() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text(
        'Submit a daily report before submitting construction progress.',
      ),
      const SizedBox(height: 8),
      for (final project in _projects) _projectCard(project),
      FilledButton.icon(
        onPressed: _projects.isEmpty ? null : _newDailyReport,
        icon: const Icon(Icons.assignment_add),
        label: const Text('Create daily report'),
      ),
      const SizedBox(height: 8),
      FilledButton.icon(
        onPressed: _projects.isEmpty ? null : _newProgress,
        icon: const Icon(Icons.trending_up),
        label: const Text('Submit progress'),
      ),
    ],
  );

  Widget _dailyReports() => ListView(
    padding: const EdgeInsets.all(14),
    children: [
      Row(
        children: [
          const Expanded(
            child: Text(
              'Daily Reports',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: govNavy,
              ),
            ),
          ),
          FilledButton.icon(
            onPressed: _projects.isEmpty ? null : _newDailyReport,
            icon: const Icon(Icons.add, size: 17),
            label: const Text('New'),
          ),
        ],
      ),
      const SizedBox(height: 8),
      _sectionCard(
        title: 'Log Today’s Construction Activity',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Create a daily site report before submitting a progress update.',
              style: TextStyle(color: Colors.blueGrey.shade700, fontSize: 12),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _projects.isEmpty ? null : _newDailyReport,
              icon: const Icon(Icons.assignment_add),
              label: const Text('Submit Daily Report'),
            ),
          ],
        ),
      ),
      _sectionCard(
        title: 'Recent Daily Reports (${_featureItems.length})',
        child: _featureItems.isEmpty
            ? _emptyMessage('No daily reports yet.')
            : Column(
                children: _featureItems.take(20).map((report) {
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      backgroundColor: Color(0xFFEFF6FF),
                      child: Icon(Icons.description_outlined, color: govBlue),
                    ),
                    title: Text(
                      'Report #${report['id']} · ${report['project_id']}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      'Material: ${report['material'] ?? '—'}\n'
                      'Labour: ${report['labour'] ?? '—'}\n'
                      '${report['work_done'] ?? ''}',
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                }).toList(),
              ),
      ),
      OutlinedButton.icon(
        onPressed: () => _openFeature('submit-progress'),
        icon: const Icon(Icons.trending_up),
        label: const Text('Submit Progress Update'),
      ),
    ],
  );

  Widget _dataCard(
    Map<String, dynamic> item, {
    List<Widget> actions = const [],
  }) {
    final ignored = {'id', 'created_at', 'updated_at'};
    final fields = item.entries
        .where((entry) => !ignored.contains(entry.key))
        .toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (item['title'] != null)
              Text(
                '${item['title']}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            for (final entry in fields)
              if (entry.value != null && entry.value.toString().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('${_pretty(entry.key)}: ${entry.value}'),
                ),
            if (actions.isNotEmpty)
              Align(
                alignment: Alignment.centerRight,
                child: Wrap(spacing: 8, children: actions),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _newComplaint() async {
    final issue = await _inputDialog('Describe your issue', 'Complaint');
    if (issue == null || _projects.isEmpty) return;
    final saved = await _perform(
      () => widget.api.post(
        '/api/complaints',
        token: _token,
        body: {'projectId': _projects.first['id'], 'issue': issue},
      ),
    );
    if (saved && mounted) await _openFeature('complaints');
  }

  Future<void> _newDailyReport() async {
    if (_projects.isEmpty) return;
    final values = await _formDialog('New daily report', [
      'Material',
      'Labour',
      'Work done',
    ]);
    if (values == null) return;
    final saved = await _perform(
      () => widget.api.post(
        '/api/daily-reports',
        token: _token,
        body: {
          'projectId': _projects.first['id'],
          'material': values[0],
          'labour': values[1],
          'workDone': values[2],
        },
      ),
    );
    if (saved && mounted) await _openFeature('daily-report');
  }

  Future<void> _newProgress() async {
    if (_projects.isEmpty) return;
    try {
      final reportData = await widget.api.get(
        '/api/daily-reports',
        token: _token,
      );
      final reports = _maps(
        reportData['reports'],
      ).where((item) => item['project_id'] == _projects.first['id']).toList();
      if (reports.isEmpty) {
        throw Exception('Create a daily report for this project first.');
      }
      final values = await _formDialog('Submit construction progress', [
        'Construction stage',
        'Progress percent (0-100)',
        'Notes (optional)',
      ]);
      if (values == null) return;
      final saved = await _perform(
        () => widget.api.post(
          '/api/progress',
          token: _token,
          body: {
            'projectId': _projects.first['id'],
            'dailyReportId': reports.first['id'],
            'stage': values[0],
            'progress': num.tryParse(values[1]) ?? -1,
            'notes': values[2],
            'material': reports.first['material'],
            'labour': reports.first['labour'],
            'workDone': reports.first['work_done'],
          },
        ),
      );
      if (saved && mounted) await _openFeature('submit-progress');
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  Future<void> _decideProgress(Map<String, dynamic> item, String status) async {
    final feedback = await _inputDialog('Feedback (optional)', status);
    if (feedback == null) return;
    final saved = await _perform(
      () => widget.api.post(
        '/api/progress/${item['id']}/decision',
        token: _token,
        body: {
          'status': status == 'Rejected' ? 'Rejected' : 'Approved',
          'feedback': feedback,
        },
      ),
    );
    if (saved && mounted) await _openFeature('progress-queue');
  }

  Future<void> _updateComplaint(Map<String, dynamic> item) async {
    final values = await _formDialog('Update complaint', [
      'Status',
      'Response',
    ]);
    if (values == null) return;
    final saved = await _perform(
      () => widget.api.patch(
        '/api/complaints/${item['id']}',
        token: _token,
        body: {'status': values[0], 'response': values[1]},
      ),
    );
    if (saved && mounted) await _openFeature('complaints');
  }

  Future<bool> _perform(Future<Object?> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      if (mounted) await _loadProjects();
      return true;
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _inputDialog(String label, String title) async {
    final values = await _formDialog(title, [label]);
    return values?.first;
  }

  Future<List<String>?> _formDialog(String title, List<String> labels) async {
    final controllers = labels.map((_) => TextEditingController()).toList();
    final result = await showDialog<List<String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < labels.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: TextField(
                      controller: controllers[i],
                      maxLines:
                          labels[i].toLowerCase().contains('notes') ||
                              labels[i].toLowerCase().contains('response') ||
                              labels[i].toLowerCase().contains('work done')
                          ? 3
                          : 1,
                      decoration: InputDecoration(
                        border: const OutlineInputBorder(),
                        labelText: labels[i],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              controllers.map((controller) => controller.text.trim()).toList(),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    for (final controller in controllers) {
      controller.dispose();
    }
    return result;
  }
}

class _Feature {
  const _Feature(this.title, this.id);
  final String title;
  final String id;
}

IconData _iconForFeature(String feature) {
  switch (feature) {
    case 'projects':
      return Icons.apartment;
    case 'complaints':
      return Icons.report_problem_outlined;
    case 'notices':
      return Icons.campaign_outlined;
    case 'notifications':
      return Icons.notifications_outlined;
    case 'daily-reports':
      return Icons.assignment_outlined;
    case 'contractor-progress':
    case 'government-progress':
      return Icons.trending_up;
    case 'reports':
      return Icons.analytics_outlined;
    default:
      return Icons.dashboard_outlined;
  }
}

List<Map<String, dynamic>> _maps(dynamic value) {
  if (value is! List) return [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}

String _pretty(String key) {
  return key
      .replaceAll('_', ' ')
      .replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'),
        (match) => '${match[1]} ${match[2]}',
      )
      .split(' ')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');
}

String _message(Object error) =>
    error.toString().replaceFirst(RegExp(r'^Exception: '), '');
