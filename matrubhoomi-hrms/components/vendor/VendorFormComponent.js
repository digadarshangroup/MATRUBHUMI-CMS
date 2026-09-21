"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Building,
  FileText,
  User,
  MapPin,
  Banknote,
  Settings,
  Factory,
  Users,
  Briefcase,
  CreditCard,
  Upload,
  Camera,
  Check,
  X,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Save,
  Search,
  FileCheck,
  Scale,
  Package,
  Calendar,
  DollarSign,
  Building2,
  UserCircle,
} from "lucide-react";
import {
  Button,
  Field,
  Input,
  PageHead,
  Panel,
  Select,
  Textarea,
} from "@/components/ceo/ui/Primitives";
import {
  uploadVendorDocument,
  uploadProfileImage,
  uploadAdditionalDocument,
} from "@/lib/vendorCloudinaryUpload";

// Generate random data for testing
const generateRandomData = () => {
  const companyNames = [
    "Sharma Agro Traders",
    "Konark Seeds & Fertilisers",
    "Utkal Aqua Feeds",
    "Eastern Hatcheries",
    "Kalinga Building Materials",
    "Sunrise Cement Depot",
    "Mahanadi Earthmovers",
    "Precision Borewells",
    "Green Field Nursery",
    "Coastal Cold Storage",
  ];

  const categories = [
    "Seeds & Fertilisers",
    "Fish & Prawn Feed",
    "Building Materials",
    "Equipment & Machinery",
    "Logistics Partner",
    "Labour Contractor",
  ];

  const products = [
    "Paddy seed, Urea, DAP",
    "Floating feed, Starter feed",
    "Cement, Sand, Aggregate, Steel",
    "Tractors, Pumps, Aerators",
    "Transport & Delivery",
    "Skilled & unskilled labour",
  ];

  const cities = [
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Chennai",
    "Ahmedabad",
    "Surat",
  ];
  const states = ["Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Gujarat"];
  const bankNames = [
    "HDFC Bank",
    "ICICI Bank",
    "SBI",
    "Axis Bank",
    "Kotak Mahindra",
  ];

  const randomCompany =
    companyNames[Math.floor(Math.random() * companyNames.length)];
  const randomCategory =
    categories[Math.floor(Math.random() * categories.length)];
  const randomProduct = products[Math.floor(Math.random() * products.length)];

  return {
    // Basic Information
    name: randomCompany,
    category: randomCategory,
    contactPerson: `Mr. ${["Raj", "Sunil", "Amit", "Vikram", "Suresh"][Math.floor(Math.random() * 5)]} ${["Sharma", "Patel", "Singh", "Kumar", "Verma"][Math.floor(Math.random() * 5)]}`,
    email: `${randomCompany.toLowerCase().replace(/\s+/g, "")}@gmail.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    alternatePhone: `8${Math.floor(100000000 + Math.random() * 900000000)}`,

    // Factory & Infrastructure
    factorySize: `${Math.floor(1000 + Math.random() * 9000)} sq ft`,
    productionLines: Math.floor(1 + Math.random() * 5),
    totalMachines: Math.floor(10 + Math.random() * 90),
    machineCondition: ["New", "Average", "Old"][Math.floor(Math.random() * 3)],
    cuttingFacility: Math.random() > 0.3,
    pressingFacility: Math.random() > 0.4,
    packingFacility: Math.random() > 0.5,

    // Manpower
    totalOperators: Math.floor(20 + Math.random() * 80),
    skilledOperators: Math.floor(10 + Math.random() * 30),
    supervisors: Math.floor(2 + Math.random() * 5),
    helpers: Math.floor(5 + Math.random() * 15),
    shifts: Math.floor(1 + Math.random() * 3),
    workingHours: "9 AM - 6 PM",

    // Products & Experience
    productsHandled: randomProduct,
    sampleTime: `${Math.floor(3 + Math.random() * 7)} days`,
    highestComplexity: [
      "Shirts",
      "Trousers",
      "Jackets",
      "Formal Wear",
      "Denim",
    ][Math.floor(Math.random() * 5)],
    majorCustomers: ["Brand A", "Brand B", "Export Clients"][
      Math.floor(Math.random() * 3)
    ],

    // Production Reality
    avgProductionPerMachine: Math.floor(50 + Math.random() * 150),
    monthlyProduction: Math.floor(5000 + Math.random() * 15000),
    rejectionRate: `${(Math.random() * 5).toFixed(1)}%`,
    reworkRate: `${(Math.random() * 3).toFixed(1)}%`,
    overtimeRequired: ["Low", "Medium", "High"][Math.floor(Math.random() * 3)],

    // SAM Capacity
    avgSAM: (Math.random() * 10 + 5).toFixed(1),
    totalMonthlySAM: Math.floor(10000 + Math.random() * 40000),
    comfortableWorkload: Math.floor(5000 + Math.random() * 10000),
    maxWorkload: Math.floor(15000 + Math.random() * 20000),

    // Financial Details
    yearlyTurnover: `₹${Math.floor(50 + Math.random() * 950)} lakhs`,
    monthlyFixedExpenses: `₹${Math.floor(5 + Math.random() * 45)} lakhs`,
    monthlySalaryPayout: `₹${Math.floor(2 + Math.random() * 18)} lakhs`,
    workingCapital: `₹${Math.floor(10 + Math.random() * 40)} lakhs`,
    sustainabilityMonths: Math.floor(3 + Math.random() * 9),

    // Legal Details
    firmType: ["Proprietor", "Partnership", "LLP", "Pvt Ltd"][
      Math.floor(Math.random() * 4)
    ],
    gstNumber: `27${Math.random().toString(36).substring(2, 14).toUpperCase()}`,
    panNumber: `AAAPL${Math.floor(1000 + Math.random() * 9000)}C`,
    udyamNumber: `UDYAM-${Math.floor(10000000 + Math.random() * 90000000)}`,
    labourLicense: `LL/${Math.floor(10000 + Math.random() * 90000)}/2024`,

    // Compliance
    lastAudit: "2024-03-15",
    qualityControl: Math.random() > 0.3,
    recordSystem: ["Manual", "Computer"][Math.floor(Math.random() * 2)],

    // Business Terms
    address: `${Math.floor(100 + Math.random() * 900)} ${["Main Street", "Industrial Area", "Market Road", "Factory Lane"][Math.floor(Math.random() * 4)]}, ${cities[Math.floor(Math.random() * cities.length)]}`,
    city: cities[Math.floor(Math.random() * cities.length)],
    state: states[Math.floor(Math.random() * states.length)],
    pincode: `${Math.floor(400000 + Math.random() * 100000)}`,
    leadTime: `${Math.floor(3 + Math.random() * 12)}-${Math.floor(15 + Math.random() * 15)} days`,
    paymentTerms: ["Net 15", "Net 30", "Net 45", "Net 60"][
      Math.floor(Math.random() * 4)
    ],

    // Bank Details
    bankName: bankNames[Math.floor(Math.random() * bankNames.length)],
    accountNumber: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    ifscCode: `HDFC0${Math.floor(100000 + Math.random() * 900000)}`,
    accountHolderName: randomCompany,

    // Status
    status: Math.random() > 0.3 ? "active" : "inactive",
    rating: (Math.random() * 3 + 2).toFixed(1),
    notes: "Reliable supplier with good track record",
  };
};

// Form sections configuration
const formSections = [
  { id: "basicInfo", title: "Basic Information", icon: Building },
  { id: "legal", title: "Legal & Compliance", icon: FileCheck },
  { id: "factory", title: "Factory Details", icon: Factory },
  { id: "manpower", title: "Manpower & Production", icon: Users },
  { id: "financial", title: "Financial Details", icon: Banknote },
  { id: "business", title: "Business Terms", icon: Briefcase },
  { id: "documents", title: "Documents", icon: FileText },
];

// Main Vendor Form Component
export default function VendorFormComponent({ vendorId = null }) {
  const router = useRouter();
  const isEditMode = vendorId !== null;

  // State for current step
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [errorMessages, setErrorMessages] = useState({
    form: null,
    upload: null,
    validation: null,
  });

  // Form data state
  const [formData, setFormData] = useState({
    // Basic Information
    basicInfo: {
      name: "",
      contactPerson: "",
      firmType: "",
      email: "",
      phone: "",
      alternatePhone: "",
      category: "",
      productsHandled: "",
      status: "active",
      rating: "",
      notes: "",
    },

    // Legal & Compliance
    legal: {
      gstNumber: "",
      panNumber: "",
      udyamNumber: "",
      labourLicense: "",
      factoryRegistration: "",
      ownerName: "",
      directorNames: "",
      registeredAddress: "",
      factoryAddress: "",
      lastAudit: "",
      qualityControl: false,
      recordSystem: "",
    },

    // Factory Details
    factory: {
      factorySize: "",
      productionLines: "",
      lineLayoutAvailable: false,
      cuttingFacility: false,
      pressingFacility: false,
      packingFacility: false,
      totalMachines: "",
      machineBreakup: "",
      specialMachines: "",
      machineCondition: "",
    },

    // Manpower & Production
    manpower: {
      totalOperators: "",
      skilledOperators: "",
      supervisors: "",
      helpers: "",
      absenteeismRate: "",
      shifts: "",
      workingHours: "",
      weeklyOff: "",
      avgProductionPerMachine: "",
      monthlyProduction: "",
      rejectionRate: "",
      reworkRate: "",
      overtimeRequired: "",
      highestComplexity: "",
      sampleTime: "",
      majorCustomers: "",
    },

    // SAM Capacity
    samCapacity: {
      avgSAM: "",
      totalMonthlySAM: "",
      comfortableWorkload: "",
      maxWorkload: "",
    },

    // Financial Details
    financial: {
      yearlyTurnover: "",
      monthlyFixedExpenses: "",
      monthlySalaryPayout: "",
      workingCapital: "",
      sustainabilityMonths: "",
      existingLoans: "",
      workingCapitalPosition: "",
      pastDefaults: "",
    },

    // Business Terms
    business: {
      leadTime: "",
      paymentTerms: "",
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
    },

    // Documents
    documents: {
      profileImage: "",
      gstCertificate: "",
      panCard: "",
      udyamCertificate: "",
      labourLicenseCopy: "",
      bankCheque: "",
      additionalDocuments: [],
    },
  });

  // Uploaded files state
  const [uploadedFiles, setUploadedFiles] = useState({
    profileImage: null,
    gstCertificate: null,
    panCard: null,
    udyamCertificate: null,
    labourLicenseCopy: null,
    bankCheque: null,
  });

  const [additionalDocuments, setAdditionalDocuments] = useState([]);

  // File input refs
  const fileInputRefs = useRef({
    profileImage: null,
    gstCertificate: null,
    panCard: null,
    udyamCertificate: null,
    labourLicenseCopy: null,
    bankCheque: null,
  });

  // Handle fill random data for development
  const handleFillRandomData = () => {
    if (
      !window.confirm(
        "This will fill all fields with random test data. Continue?",
      )
    ) {
      return;
    }

    const randomData = generateRandomData();

    setFormData({
      basicInfo: {
        name: randomData.name,
        contactPerson: randomData.contactPerson,
        firmType: randomData.firmType,
        email: randomData.email,
        phone: randomData.phone,
        alternatePhone: randomData.alternatePhone,
        category: randomData.category,
        productsHandled: randomData.productsHandled,
        status: randomData.status,
        rating: randomData.rating,
        notes: randomData.notes,
      },
      legal: {
        gstNumber: randomData.gstNumber,
        panNumber: randomData.panNumber,
        udyamNumber: randomData.udyamNumber,
        labourLicense: randomData.labourLicense,
        factoryRegistration: `FR/${Math.floor(10000 + Math.random() * 90000)}`,
        ownerName: randomData.contactPerson,
        directorNames: `${randomData.contactPerson}${Math.random() > 0.5 ? `, Mrs. ${["Priya", "Anjali", "Sneha", "Ritu", "Neha"][Math.floor(Math.random() * 5)]} ${["Sharma", "Patel", "Singh", "Kumar", "Verma"][Math.floor(Math.random() * 5)]}` : ""}`,
        registeredAddress: randomData.address,
        factoryAddress: randomData.address,
        lastAudit: randomData.lastAudit,
        qualityControl: randomData.qualityControl,
        recordSystem: randomData.recordSystem,
      },
      factory: {
        factorySize: randomData.factorySize,
        productionLines: randomData.productionLines.toString(),
        lineLayoutAvailable: Math.random() > 0.5,
        cuttingFacility: randomData.cuttingFacility,
        pressingFacility: randomData.pressingFacility,
        packingFacility: randomData.packingFacility,
        totalMachines: randomData.totalMachines.toString(),
        machineBreakup: `${Math.floor(randomData.totalMachines * 0.6)} stitching, ${Math.floor(randomData.totalMachines * 0.2)} overlock, ${Math.floor(randomData.totalMachines * 0.1)} button, ${Math.floor(randomData.totalMachines * 0.1)} special`,
        specialMachines: "Button, Buttonhole, Bartack, Kansai",
        machineCondition: randomData.machineCondition,
      },
      manpower: {
        totalOperators: randomData.totalOperators.toString(),
        skilledOperators: randomData.skilledOperators.toString(),
        supervisors: randomData.supervisors.toString(),
        helpers: randomData.helpers.toString(),
        absenteeismRate: `${(Math.random() * 10).toFixed(1)}%`,
        shifts: randomData.shifts.toString(),
        workingHours: randomData.workingHours,
        weeklyOff: "Sunday",
        avgProductionPerMachine: randomData.avgProductionPerMachine.toString(),
        monthlyProduction: randomData.monthlyProduction.toString(),
        rejectionRate: randomData.rejectionRate,
        reworkRate: randomData.reworkRate,
        overtimeRequired: randomData.overtimeRequired,
        highestComplexity: randomData.highestComplexity,
        sampleTime: randomData.sampleTime,
        majorCustomers: randomData.majorCustomers,
      },
      samCapacity: {
        avgSAM: randomData.avgSAM,
        totalMonthlySAM: randomData.totalMonthlySAM.toString(),
        comfortableWorkload: randomData.comfortableWorkload.toString(),
        maxWorkload: randomData.maxWorkload.toString(),
      },
      financial: {
        yearlyTurnover: randomData.yearlyTurnover,
        monthlyFixedExpenses: randomData.monthlyFixedExpenses,
        monthlySalaryPayout: randomData.monthlySalaryPayout,
        workingCapital: randomData.workingCapital,
        sustainabilityMonths: randomData.sustainabilityMonths.toString(),
        existingLoans:
          Math.random() > 0.5
            ? `₹${Math.floor(5 + Math.random() * 25)} lakhs`
            : "None",
        workingCapitalPosition: ["Good", "Average", "Tight"][
          Math.floor(Math.random() * 3)
        ],
        pastDefaults: Math.random() > 0.8 ? "None" : "Cleared all",
      },
      business: {
        leadTime: randomData.leadTime,
        paymentTerms: randomData.paymentTerms,
        bankName: randomData.bankName,
        accountNumber: randomData.accountNumber,
        ifscCode: randomData.ifscCode,
        accountHolderName: randomData.accountHolderName,
        address: randomData.address,
        city: randomData.city,
        state: randomData.state,
        pincode: randomData.pincode,
      },
      documents: {
        profileImage: "",
        gstCertificate: "",
        panCard: "",
        udyamCertificate: "",
        labourLicenseCopy: "",
        bankCheque: "",
        additionalDocuments: [],
      },
    });

    // Mark all steps as completed for easy navigation
    setCompletedSteps([0, 1, 2, 3, 4, 5, 6]);

    alert(
      "Random data filled successfully! You can now navigate through all tabs.",
    );
  };

  // Handle file upload
  const handleFileUpload = async (field, file, type) => {
    if (!file) return;

    setUploadingFile(field);
    setErrorMessages((prev) => ({ ...prev, upload: null }));

    try {
      let uploadResult;

      switch (field) {
        case "profileImage":
          uploadResult = await uploadProfileImage(file);
          break;
        case "gstCertificate":
        case "panCard":
        case "udyamCertificate":
        case "labourLicenseCopy":
        case "bankCheque":
        case "aadharFile":
          uploadResult = await uploadVendorDocument(file, field);
          break;
        default:
          uploadResult = await uploadVendorDocument(file, "other");
      }

      setFormData((prev) => ({
        ...prev,
        documents: {
          ...prev.documents,
          [field]: {
            url: uploadResult.url,
            publicId: uploadResult.publicId,
          },
        },
      }));

      setUploadedFiles((prev) => ({
        ...prev,
        [field]: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          name: file.name,
          size: uploadResult.bytes,
          type: field,
        },
      }));
    } catch (error) {
      console.error("File upload error:", error);
      showError("upload", error.message);
    } finally {
      setUploadingFile(null);
    }
  };

  // Handle additional document upload
  const handleAdditionalDocumentUpload = async (id, file, title) => {
    if (!file) return;

    setUploadingFile(`additional-${id}`);

    try {
      const uploadResult = await uploadAdditionalDocument(file, title);

      const updatedDoc = {
        id,
        title,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        fileName: file.name,
        fileSize: uploadResult.bytes,
      };

      const updatedAdditionalDocs = additionalDocuments.map((doc) =>
        doc.id === id ? updatedDoc : doc,
      );

      setAdditionalDocuments(updatedAdditionalDocs);

      // Update formData
      setFormData((prev) => ({
        ...prev,
        documents: {
          ...prev.documents,
          additionalDocuments: updatedAdditionalDocs.map((doc) => ({
            title: doc.title,
            url: doc.url,
            publicId: doc.publicId,
          })),
        },
      }));
    } catch (error) {
      console.error("Additional document upload error:", error);
      showError("upload", error.message);
    } finally {
      setUploadingFile(null);
    }
  };

  // Error handling
  const showError = (type, message) => {
    setErrorMessages((prev) => ({
      ...prev,
      [type]: message,
    }));

    setTimeout(() => {
      setErrorMessages((prev) => ({
        ...prev,
        [type]: null,
      }));
    }, 5000);
  };

  // Navigation
  const handleNextStep = () => {
    if (validateCurrentStep()) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      if (currentStep < formSections.length - 1) {
        setCurrentStep(currentStep + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Validation
  const validateCurrentStep = () => {
    const currentSection = formSections[currentStep].id;
    let isValid = true;

    switch (currentSection) {
      case "basicInfo":
        if (
          !formData.basicInfo.name ||
          !formData.basicInfo.contactPerson ||
          !formData.basicInfo.phone
        ) {
          showError("validation", "Please fill all required basic information");
          isValid = false;
        }
        break;
      case "legal":
        if (!formData.legal.gstNumber || !formData.legal.panNumber) {
          showError("validation", "GST and PAN numbers are required");
          isValid = false;
        }
        break;
      case "business":
        if (!formData.business.leadTime || !formData.business.paymentTerms) {
          showError("validation", "Lead time and payment terms are required");
          isValid = false;
        }
        break;
    }

    return isValid;
  };

  // Input change handler
  const handleInputChange = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));

    if (errorMessages.validation) {
      setErrorMessages((prev) => ({ ...prev, validation: null }));
    }
  };

  // Handle checkbox change
  const handleCheckboxChange = (section, field, checked) => {
    handleInputChange(section, field, checked);
  };

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    console.log("Form submit triggered");

    // Check if form is already submitting
    if (isSubmitting) {
      console.log("Form is already submitting, skipping...");
      return;
    }

    // Validation
    const requiredFields = [
      { section: "basicInfo", field: "name", label: "Vendor Name" },
      { section: "basicInfo", field: "contactPerson", label: "Contact Person" },
      { section: "basicInfo", field: "phone", label: "Phone Number" },
      { section: "basicInfo", field: "category", label: "Category" },
    ];

    const missingFields = requiredFields.filter(
      ({ section, field }) => !formData[section][field],
    );

    if (missingFields.length > 0) {
      showError(
        "validation",
        `Missing required fields: ${missingFields.map((f) => f.label).join(", ")}`,
      );
      // Scroll to first step if validation fails
      setCurrentStep(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Validate document uploads - make these optional for now for testing
    // if (!uploadedFiles.gstCertificate?.url) {
    //   showError("validation", "Please upload GST Certificate");
    //   return;
    // }

    // if (!uploadedFiles.panCard?.url) {
    //   showError("validation", "Please upload PAN Card");
    //   return;
    // }

    console.log("Validation passed, preparing data...");

    setIsSubmitting(true);
    setErrorMessages((prev) => ({ ...prev, form: null }));

    try {
      // Prepare the complete vendor data for backend
      const vendorData = {
        // Basic Information
        name: formData.basicInfo.name,
        contactPerson: formData.basicInfo.contactPerson,
        firmType: formData.basicInfo.firmType,
        email: formData.basicInfo.email,
        phone: formData.basicInfo.phone,
        alternatePhone: formData.basicInfo.alternatePhone,
        category: formData.basicInfo.category,
        productsHandled: formData.basicInfo.productsHandled,
        status: formData.basicInfo.status,
        rating: parseFloat(formData.basicInfo.rating) || 0,
        notes: formData.basicInfo.notes,

        // Legal & Compliance
        gstNumber: formData.legal.gstNumber,
        panNumber: formData.legal.panNumber,
        udyamNumber: formData.legal.udyamNumber,
        labourLicense: formData.legal.labourLicense,
        factoryRegistration: formData.legal.factoryRegistration,
        ownerName: formData.legal.ownerName,
        directorNames: formData.legal.directorNames,
        registeredAddress: formData.legal.registeredAddress,
        factoryAddress: formData.legal.factoryAddress,
        lastAudit: formData.legal.lastAudit,
        qualityControl: formData.legal.qualityControl,
        recordSystem: formData.legal.recordSystem,

        // Factory Details
        factorySize: formData.factory.factorySize,
        productionLines: parseInt(formData.factory.productionLines) || 0,
        lineLayoutAvailable: formData.factory.lineLayoutAvailable,
        cuttingFacility: formData.factory.cuttingFacility,
        pressingFacility: formData.factory.pressingFacility,
        packingFacility: formData.factory.packingFacility,
        totalMachines: parseInt(formData.factory.totalMachines) || 0,
        machineBreakup: formData.factory.machineBreakup,
        specialMachines: formData.factory.specialMachines,
        machineCondition: formData.factory.machineCondition,

        // Manpower & Production
        totalOperators: parseInt(formData.manpower.totalOperators) || 0,
        skilledOperators: parseInt(formData.manpower.skilledOperators) || 0,
        supervisors: parseInt(formData.manpower.supervisors) || 0,
        helpers: parseInt(formData.manpower.helpers) || 0,
        absenteeismRate: formData.manpower.absenteeismRate,
        shifts: parseInt(formData.manpower.shifts) || 1,
        workingHours: formData.manpower.workingHours,
        weeklyOff: formData.manpower.weeklyOff,
        avgProductionPerMachine:
          parseInt(formData.manpower.avgProductionPerMachine) || 0,
        monthlyProduction: parseInt(formData.manpower.monthlyProduction) || 0,
        rejectionRate: formData.manpower.rejectionRate,
        reworkRate: formData.manpower.reworkRate,
        overtimeRequired: formData.manpower.overtimeRequired,
        highestComplexity: formData.manpower.highestComplexity,
        sampleTime: formData.manpower.sampleTime,
        majorCustomers: formData.manpower.majorCustomers,

        // SAM Capacity
        avgSAM: parseFloat(formData.samCapacity.avgSAM) || 0,
        totalMonthlySAM: parseInt(formData.samCapacity.totalMonthlySAM) || 0,
        comfortableWorkload:
          parseInt(formData.samCapacity.comfortableWorkload) || 0,
        maxWorkload: parseInt(formData.samCapacity.maxWorkload) || 0,

        // Financial Details
        yearlyTurnover: formData.financial.yearlyTurnover,
        monthlyFixedExpenses: formData.financial.monthlyFixedExpenses,
        monthlySalaryPayout: formData.financial.monthlySalaryPayout,
        workingCapital: formData.financial.workingCapital,
        sustainabilityMonths:
          parseInt(formData.financial.sustainabilityMonths) || 0,
        existingLoans: formData.financial.existingLoans,
        workingCapitalPosition: formData.financial.workingCapitalPosition,
        pastDefaults: formData.financial.pastDefaults,

        // Business Terms
        leadTime: formData.business.leadTime,
        paymentTerms: formData.business.paymentTerms,
        bankName: formData.business.bankName,
        accountNumber: formData.business.accountNumber,
        ifscCode: formData.business.ifscCode,
        accountHolderName: formData.business.accountHolderName,
        address: formData.business.address,
        city: formData.business.city,
        state: formData.business.state,
        pincode: formData.business.pincode,

        // Documents
        documents: {
          panFile: uploadedFiles.panCard
            ? {
                url: uploadedFiles.panCard.url,
                publicId: uploadedFiles.panCard.publicId,
              }
            : null,
          gstCertificate: uploadedFiles.gstCertificate
            ? {
                url: uploadedFiles.gstCertificate.url,
                publicId: uploadedFiles.gstCertificate.publicId,
              }
            : null,
          udyamCertificate: uploadedFiles.udyamCertificate
            ? {
                url: uploadedFiles.udyamCertificate.url,
                publicId: uploadedFiles.udyamCertificate.publicId,
              }
            : null,
          labourLicenseCopy: uploadedFiles.labourLicenseCopy
            ? {
                url: uploadedFiles.labourLicenseCopy.url,
                publicId: uploadedFiles.labourLicenseCopy.publicId,
              }
            : null,
          bankCheque: uploadedFiles.bankCheque
            ? {
                url: uploadedFiles.bankCheque.url,
                publicId: uploadedFiles.bankCheque.publicId,
              }
            : null,
          profileImage: uploadedFiles.profileImage
            ? {
                url: uploadedFiles.profileImage.url,
                publicId: uploadedFiles.profileImage.publicId,
              }
            : null,
          additionalDocuments: additionalDocuments.map((doc) => ({
            title: doc.title,
            url: doc.url,
            publicId: doc.publicId,
          })),
        },
      };

      console.log(
        "Prepared vendor data for API:",
        JSON.stringify(vendorData, null, 2),
      );

      // Check API URL
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      console.log("API URL:", API_URL);

      const url = isEditMode
        ? `${API_URL}/api/hr/vendors/${vendorId}`
        : `${API_URL}/api/hr/vendors`;

      const method = isEditMode ? "PUT" : "POST";

      console.log("Sending to URL:", url);
      console.log("Using method:", method);

      // Test the API endpoint first
      try {
        const testResponse = await fetch(`${API_URL}/api/health`);
        console.log("Health check status:", testResponse.status);
      } catch (healthError) {
        console.error("Health check failed:", healthError);
        throw new Error(
          `Backend server might not be running at ${API_URL}. Please check if the server is started.`,
        );
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(vendorData),
      });

      console.log("Response status:", response.status);
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
          console.error("Response error text:", errorText);

          // Try to parse as JSON
          try {
            const errorJson = JSON.parse(errorText);
            throw new Error(
              errorJson.message || `HTTP error! status: ${response.status}`,
            );
          } catch {
            throw new Error(
              `HTTP error! status: ${response.status}. Message: ${errorText}`,
            );
          }
        } catch (textError) {
          throw new Error(
            `HTTP error! status: ${response.status}. Could not read response.`,
          );
        }
      }

      const data = await response.json();
      console.log("Response data:", data);

      if (!data.success) {
        throw new Error(
          data.message ||
            data.errors?.join(", ") ||
            `Failed to ${isEditMode ? "update" : "create"} vendor`,
        );
      }

      // Show success message with credentials if it's a new vendor
      if (!isEditMode && data.credentials) {
        alert(
          `Vendor created successfully!\n\n` +
            `Username: ${data.credentials.username}\n` +
            `Password: ${data.credentials.password}\n\n` +
            `Please share these credentials with the vendor.`,
        );
      } else {
        alert(`Vendor ${isEditMode ? "updated" : "created"} successfully!`);
      }

      router.push("/hr/dashboard/vendors");
    } catch (error) {
      console.error("Submit error details:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);

      // More detailed error message
      const errorMessage =
        error.message ||
        "Failed to save vendor. Please check: \n1. Backend server is running \n2. API endpoint is correct \n3. Network connectivity";
      showError("form", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Add Handler (Basic Info Only)
  const handleQuickAdd = async (e) => {
    e.preventDefault();

    // Validate only basic required fields
    if (
      !formData.basicInfo.name ||
      !formData.basicInfo.contactPerson ||
      !formData.basicInfo.phone
    ) {
      showError(
        "validation",
        "Please fill at least Name, Contact Person, and Phone Number",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const quickVendorData = {
        name: formData.basicInfo.name.trim(),
        contactPerson: formData.basicInfo.contactPerson.trim(),
        email: formData.basicInfo.email?.toLowerCase().trim() || "",
        phone: formData.basicInfo.phone.trim(),
        category: formData.basicInfo.category || "",
        status: "active",
        // Add other fields as empty/default
        gstNumber: "",
        panNumber: "",
        leadTime: "",
        paymentTerms: "Net 30",
        address: "",
        city: "",
        state: "",
        rating: 0,
        notes: "Added via quick add",
      };

      console.log("Quick adding vendor:", quickVendorData);

      alert("Vendor added successfully via quick add!");
      router.push("/hr/dashboard/vendors");
    } catch (error) {
      console.error("Quick add error:", error);
      showError("form", "Failed to add vendor");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch vendor data for edit mode
  useEffect(() => {
    if (isEditMode && vendorId) {
      fetchVendorData();
    }
  }, [isEditMode, vendorId]);

  // Function to fetch vendor data
  const fetchVendorData = async () => {
    try {
      console.log("Fetching vendor data for ID:", vendorId);

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(`${API_URL}/api/hr/vendors/${vendorId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch vendor: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const vendor = data.data;
        console.log("Vendor data received:", vendor);

        // Update form data with vendor information
        setFormData({
          basicInfo: {
            name: vendor.name || "",
            contactPerson: vendor.contactPerson || "",
            firmType: vendor.firmType || "",
            email: vendor.email || "",
            phone: vendor.phone || "",
            alternatePhone: vendor.alternatePhone || "",
            category: vendor.category || "",
            productsHandled: vendor.productsHandled || "",
            status: vendor.status || "active",
            rating: vendor.rating?.toString() || "",
            notes: vendor.notes || "",
          },
          legal: {
            gstNumber: vendor.gstNumber || "",
            panNumber: vendor.panNumber || "",
            udyamNumber: vendor.udyamNumber || "",
            labourLicense: vendor.labourLicense || "",
            factoryRegistration: vendor.factoryRegistration || "",
            ownerName: vendor.ownerName || "",
            directorNames: vendor.directorNames || "",
            registeredAddress: vendor.registeredAddress || "",
            factoryAddress: vendor.factoryAddress || "",
            lastAudit: vendor.lastAudit || "",
            qualityControl: vendor.qualityControl || false,
            recordSystem: vendor.recordSystem || "",
          },
          factory: {
            factorySize: vendor.factorySize || "",
            productionLines: vendor.productionLines?.toString() || "",
            lineLayoutAvailable: vendor.lineLayoutAvailable || false,
            cuttingFacility: vendor.cuttingFacility || false,
            pressingFacility: vendor.pressingFacility || false,
            packingFacility: vendor.packingFacility || false,
            totalMachines: vendor.totalMachines?.toString() || "",
            machineBreakup: vendor.machineBreakup || "",
            specialMachines: vendor.specialMachines || "",
            machineCondition: vendor.machineCondition || "",
          },
          manpower: {
            totalOperators: vendor.totalOperators?.toString() || "",
            skilledOperators: vendor.skilledOperators?.toString() || "",
            supervisors: vendor.supervisors?.toString() || "",
            helpers: vendor.helpers?.toString() || "",
            absenteeismRate: vendor.absenteeismRate || "",
            shifts: vendor.shifts?.toString() || "",
            workingHours: vendor.workingHours || "",
            weeklyOff: vendor.weeklyOff || "",
            avgProductionPerMachine:
              vendor.avgProductionPerMachine?.toString() || "",
            monthlyProduction: vendor.monthlyProduction?.toString() || "",
            rejectionRate: vendor.rejectionRate || "",
            reworkRate: vendor.reworkRate || "",
            overtimeRequired: vendor.overtimeRequired || "",
            highestComplexity: vendor.highestComplexity || "",
            sampleTime: vendor.sampleTime || "",
            majorCustomers: vendor.majorCustomers || "",
          },
          samCapacity: {
            avgSAM: vendor.avgSAM?.toString() || "",
            totalMonthlySAM: vendor.totalMonthlySAM?.toString() || "",
            comfortableWorkload: vendor.comfortableWorkload?.toString() || "",
            maxWorkload: vendor.maxWorkload?.toString() || "",
          },
          financial: {
            yearlyTurnover: vendor.yearlyTurnover || "",
            monthlyFixedExpenses: vendor.monthlyFixedExpenses || "",
            monthlySalaryPayout: vendor.monthlySalaryPayout || "",
            workingCapital: vendor.workingCapital || "",
            sustainabilityMonths: vendor.sustainabilityMonths?.toString() || "",
            existingLoans: vendor.existingLoans || "",
            workingCapitalPosition: vendor.workingCapitalPosition || "",
            pastDefaults: vendor.pastDefaults || "",
          },
          business: {
            leadTime: vendor.leadTime || "",
            paymentTerms: vendor.paymentTerms || "",
            bankName: vendor.bankName || "",
            accountNumber: vendor.accountNumber || "",
            ifscCode: vendor.ifscCode || "",
            accountHolderName: vendor.accountHolderName || "",
            address: vendor.address || "",
            city: vendor.city || "",
            state: vendor.state || "",
            pincode: vendor.pincode || "",
          },
          documents: {
            profileImage: vendor.documents?.profileImage?.url || "",
            gstCertificate: vendor.documents?.gstCertificate?.url || "",
            panCard: vendor.documents?.panFile?.url || "",
            udyamCertificate: vendor.documents?.udyamCertificate?.url || "",
            labourLicenseCopy: vendor.documents?.labourLicenseCopy?.url || "",
            bankCheque: vendor.documents?.bankCheque?.url || "",
            additionalDocuments: vendor.documents?.additionalDocuments || [],
          },
        });

        // Set uploaded files
        setUploadedFiles({
          profileImage: vendor.documents?.profileImage || null,
          gstCertificate: vendor.documents?.gstCertificate || null,
          panCard: vendor.documents?.panFile || null,
          udyamCertificate: vendor.documents?.udyamCertificate || null,
          labourLicenseCopy: vendor.documents?.labourLicenseCopy || null,
          bankCheque: vendor.documents?.bankCheque || null,
        });

        // Set additional documents
        setAdditionalDocuments(
          vendor.documents?.additionalDocuments?.map((doc, index) => ({
            id: doc._id || `doc-${index}`,
            title: doc.title || "",
            url: doc.url || "",
            publicId: doc.publicId || "",
          })) || [],
        );

        // Mark all steps as completed for easy navigation
        setCompletedSteps([0, 1, 2, 3, 4, 5, 6]);

        console.log("Vendor data loaded successfully");
      } else {
        throw new Error(data.message || "Failed to fetch vendor");
      }
    } catch (error) {
      console.error("Error fetching vendor data:", error);
      showError("form", "Failed to load vendor data: " + error.message);
    }
  };

  // Step indicator component
  const StepIndicator = () => (
    <PageHead
      kicker="Human resources"
      title={isEditMode ? "Edit Vendor" : "Add New Vendor"}
      sub={formSections[currentStep].title}
      actions={
        /* Development Tools - Only show in development AND NOT in edit mode */
        process.env.NODE_ENV === "development" && !isEditMode ? (
          <Button type="button" tone="secondary" onClick={handleFillRandomData}>
            <Plus className="h-4 w-4" />
            Fill Random Data (Dev)
          </Button>
        ) : null
      }
    >
      {/* Responsive step indicator */}
      <div className="scroll-slim -mx-2 overflow-x-auto px-2 pb-1">
        <div className="flex min-w-full items-center">
          {formSections.map((section, index) => (
            <div key={section.id} className="flex shrink-0 items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10
                ${
                  index === currentStep
                    ? "bg-ink text-[var(--body-bg)]"
                    : completedSteps.includes(index)
                      ? "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]"
                      : "bg-[var(--control)] text-ink-faint"
                }`}
              >
                {completedSteps.includes(index) ? (
                  <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <section.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>
              <div className="ml-2 sm:ml-3">
                <p
                  className={`text-xs font-medium whitespace-nowrap ${
                    index === currentStep
                      ? "text-ink"
                      : completedSteps.includes(index)
                        ? "text-[var(--state-positive-ink)]"
                        : "text-ink-faint"
                  }`}
                >
                  {section.title}
                </p>
                <p className="text-xs text-ink-faint">
                  Step <span data-figure>{index + 1}</span>
                </p>
              </div>
              {index < formSections.length - 1 && (
                <div
                  className={`mx-2 h-px w-4 sm:mx-4 sm:w-16 ${
                    completedSteps.includes(index + 1)
                      ? "bg-[var(--state-positive)]"
                      : "bg-hairline"
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageHead>
  );

  // Error message component
  const ErrorMessage = ({ type, message, onClose }) => (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-3 rounded-inset px-3.5 py-2.5 ${
        type === "validation"
          ? "bg-[color-mix(in_srgb,var(--state-rework)_16%,transparent)] text-[var(--state-rework-ink)]"
          : type === "upload"
            ? "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] text-[var(--state-overdue-ink)]"
            : "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] text-[var(--state-overdue-ink)]"
      }`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  // Upload spinner component
  const UploadSpinner = ({ isUploading, field }) =>
    isUploading === field && (
      <div className="mt-2 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        <span className="ml-2 text-sm text-ink-muted">Uploading...</span>
      </div>
    );

  // Render Basic Info Step
  const renderBasicInfoStep = () => (
    <Panel label="Basic Information">
      <div className="flex items-center gap-3 mb-6">
        <Building className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Basic Information
        </h2>
      </div>

      {errorMessages.validation && currentStep === 0 && (
        <ErrorMessage
          type="validation"
          message={errorMessages.validation}
          onClose={() =>
            setErrorMessages((prev) => ({ ...prev, validation: null }))
          }
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Vendor/Company Name" required>
          <Input
            type="text"
            value={formData.basicInfo.name}
            onChange={(e) =>
              handleInputChange("basicInfo", "name", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Contact Person" required>
          <Input
            type="text"
            value={formData.basicInfo.contactPerson}
            onChange={(e) =>
              handleInputChange("basicInfo", "contactPerson", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Firm Type">
          <Select
            value={formData.basicInfo.firmType}
            onChange={(e) =>
              handleInputChange("basicInfo", "firmType", e.target.value)
            }
          >
            <option value="">Select Type</option>
            <option value="Proprietor">Proprietor</option>
            <option value="Partnership">Partnership</option>
            <option value="LLP">LLP</option>
            <option value="Pvt Ltd">Private Limited</option>
          </Select>
        </Field>

        <Field label="Category">
          <Select
            value={formData.basicInfo.category}
            onChange={(e) =>
              handleInputChange("basicInfo", "category", e.target.value)
            }
          >
            <option value="">Select Category</option>
            <option value="Fabric Supplier">Fabric Supplier</option>
            <option value="Stitching Unit">Stitching Unit</option>
            <option value="Accessory Supplier">Accessory Supplier</option>
            <option value="Logistics Partner">Logistics Partner</option>
            <option value="Printing & Embroidery">Printing & Embroidery</option>
            <option value="Washing & Finishing">Washing & Finishing</option>
          </Select>
        </Field>

        <Field label="Email Address">
          <Input
            type="email"
            value={formData.basicInfo.email}
            onChange={(e) =>
              handleInputChange("basicInfo", "email", e.target.value)
            }
          />
        </Field>

        <Field label="Phone Number" required>
          <Input
            type="tel"
            value={formData.basicInfo.phone}
            onChange={(e) =>
              handleInputChange("basicInfo", "phone", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Alternate Phone">
          <Input
            type="tel"
            value={formData.basicInfo.alternatePhone}
            onChange={(e) =>
              handleInputChange("basicInfo", "alternatePhone", e.target.value)
            }
          />
        </Field>

        <Field label="Products/Services">
          <Input
            type="text"
            value={formData.basicInfo.productsHandled}
            onChange={(e) =>
              handleInputChange("basicInfo", "productsHandled", e.target.value)
            }
            placeholder="e.g., Cement & aggregate, Prawn feed"
          />
        </Field>

        <Field label="Status">
          <Select
            value={formData.basicInfo.status}
            onChange={(e) =>
              handleInputChange("basicInfo", "status", e.target.value)
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>

        <Field label="Rating (1-5)">
          <Input
            type="number"
            min="0"
            max="5"
            step="0.1"
            value={formData.basicInfo.rating}
            onChange={(e) =>
              handleInputChange("basicInfo", "rating", e.target.value)
            }
          />
        </Field>
      </div>

      <Field label="Notes" className="mt-6">
        <Textarea
          value={formData.basicInfo.notes}
          onChange={(e) =>
            handleInputChange("basicInfo", "notes", e.target.value)
          }
          rows="3"
          placeholder="Any additional notes about this vendor..."
        />
      </Field>
    </Panel>
  );

  // Render Legal & Compliance Step
  const renderLegalStep = () => (
    <Panel label="Legal and Compliance Details">
      <div className="flex items-center gap-3 mb-6">
        <FileCheck className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Legal & Compliance Details
        </h2>
      </div>

      {errorMessages.validation && currentStep === 1 && (
        <ErrorMessage
          type="validation"
          message={errorMessages.validation}
          onClose={() =>
            setErrorMessages((prev) => ({ ...prev, validation: null }))
          }
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Field label="GST Number" required>
          <Input
            type="text"
            value={formData.legal.gstNumber}
            onChange={(e) =>
              handleInputChange("legal", "gstNumber", e.target.value)
            }
            required
          />
        </Field>

        <Field label="PAN Number" required>
          <Input
            type="text"
            value={formData.legal.panNumber}
            onChange={(e) =>
              handleInputChange("legal", "panNumber", e.target.value)
            }
            required
          />
        </Field>

        <Field label="Udyam Registration Number">
          <Input
            type="text"
            value={formData.legal.udyamNumber}
            onChange={(e) =>
              handleInputChange("legal", "udyamNumber", e.target.value)
            }
          />
        </Field>

        <Field label="Labour License Number">
          <Input
            type="text"
            value={formData.legal.labourLicense}
            onChange={(e) =>
              handleInputChange("legal", "labourLicense", e.target.value)
            }
          />
        </Field>

        <Field label="Factory Registration">
          <Input
            type="text"
            value={formData.legal.factoryRegistration}
            onChange={(e) =>
              handleInputChange("legal", "factoryRegistration", e.target.value)
            }
          />
        </Field>

        <Field label="Owner/Proprietor Name">
          <Input
            type="text"
            value={formData.legal.ownerName}
            onChange={(e) =>
              handleInputChange("legal", "ownerName", e.target.value)
            }
          />
        </Field>

        <Field label="Director/Partner Names" className="md:col-span-2">
          <Input
            type="text"
            value={formData.legal.directorNames}
            onChange={(e) =>
              handleInputChange("legal", "directorNames", e.target.value)
            }
            placeholder="Comma separated names"
          />
        </Field>

        <Field label="Registered Office Address" className="md:col-span-2">
          <Textarea
            value={formData.legal.registeredAddress}
            onChange={(e) =>
              handleInputChange("legal", "registeredAddress", e.target.value)
            }
            rows="2"
          />
        </Field>

        <Field label="Factory Address" className="md:col-span-2">
          <Textarea
            value={formData.legal.factoryAddress}
            onChange={(e) =>
              handleInputChange("legal", "factoryAddress", e.target.value)
            }
            rows="2"
          />
        </Field>

        <Field label="Last Audit Date">
          <Input
            type="date"
            value={formData.legal.lastAudit}
            onChange={(e) =>
              handleInputChange("legal", "lastAudit", e.target.value)
            }
          />
        </Field>

        <Field label="Record System">
          <Select
            value={formData.legal.recordSystem}
            onChange={(e) =>
              handleInputChange("legal", "recordSystem", e.target.value)
            }
          >
            <option value="">Select System</option>
            <option value="Manual">Manual</option>
            <option value="Computer">Computer</option>
            <option value="Hybrid">Hybrid</option>
          </Select>
        </Field>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="qualityControl"
            checked={formData.legal.qualityControl}
            onChange={(e) =>
              handleCheckboxChange("legal", "qualityControl", e.target.checked)
            }
            className="h-4 w-4 shrink-0 rounded-inset accent-[var(--color-ink)]"
          />
          <label
            htmlFor="qualityControl"
            className="text-sm font-medium text-ink"
          >
            Has Quality Control System
          </label>
        </div>
      </div>
    </Panel>
  );

  // Render Factory Details Step
  const renderFactoryStep = () => (
    <Panel label="Factory and Infrastructure Details">
      <div className="flex items-center gap-3 mb-6">
        <Factory className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Factory & Infrastructure Details
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Factory Size (sq ft)">
          <Input
            type="text"
            value={formData.factory.factorySize}
            onChange={(e) =>
              handleInputChange("factory", "factorySize", e.target.value)
            }
          />
        </Field>

        <Field label="Production Lines">
          <Input
            type="number"
            value={formData.factory.productionLines}
            onChange={(e) =>
              handleInputChange("factory", "productionLines", e.target.value)
            }
          />
        </Field>

        <Field label="Total Machines">
          <Input
            type="number"
            value={formData.factory.totalMachines}
            onChange={(e) =>
              handleInputChange("factory", "totalMachines", e.target.value)
            }
          />
        </Field>

        <Field label="Machine Condition">
          <Select
            value={formData.factory.machineCondition}
            onChange={(e) =>
              handleInputChange("factory", "machineCondition", e.target.value)
            }
          >
            <option value="">Select Condition</option>
            <option value="New">New</option>
            <option value="Average">Average</option>
            <option value="Old">Old</option>
          </Select>
        </Field>

        <Field label="Machine Breakup" className="md:col-span-2">
          <Textarea
            value={formData.factory.machineBreakup}
            onChange={(e) =>
              handleInputChange("factory", "machineBreakup", e.target.value)
            }
            rows="2"
            placeholder="e.g., 60 stitching, 20 overlock, 10 button, 10 special"
          />
        </Field>

        <Field label="Special Machines Available" className="md:col-span-2">
          <Input
            type="text"
            value={formData.factory.specialMachines}
            onChange={(e) =>
              handleInputChange("factory", "specialMachines", e.target.value)
            }
            placeholder="e.g., Button, Buttonhole, Bartack, Kansai"
          />
        </Field>

        <div className="md:col-span-2">
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Facilities Available
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="lineLayout"
                checked={formData.factory.lineLayoutAvailable}
                onChange={(e) =>
                  handleCheckboxChange(
                    "factory",
                    "lineLayoutAvailable",
                    e.target.checked,
                  )
                }
                className="h-4 w-4 shrink-0 rounded-inset accent-[var(--color-ink)]"
              />
              <label htmlFor="lineLayout" className="text-sm text-ink-muted">
                Line Layout
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cuttingFacility"
                checked={formData.factory.cuttingFacility}
                onChange={(e) =>
                  handleCheckboxChange(
                    "factory",
                    "cuttingFacility",
                    e.target.checked,
                  )
                }
                className="h-4 w-4 shrink-0 rounded-inset accent-[var(--color-ink)]"
              />
              <label
                htmlFor="cuttingFacility"
                className="text-sm text-ink-muted"
              >
                Cutting Facility
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pressingFacility"
                checked={formData.factory.pressingFacility}
                onChange={(e) =>
                  handleCheckboxChange(
                    "factory",
                    "pressingFacility",
                    e.target.checked,
                  )
                }
                className="h-4 w-4 shrink-0 rounded-inset accent-[var(--color-ink)]"
              />
              <label
                htmlFor="pressingFacility"
                className="text-sm text-ink-muted"
              >
                Pressing & Finishing
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="packingFacility"
                checked={formData.factory.packingFacility}
                onChange={(e) =>
                  handleCheckboxChange(
                    "factory",
                    "packingFacility",
                    e.target.checked,
                  )
                }
                className="h-4 w-4 shrink-0 rounded-inset accent-[var(--color-ink)]"
              />
              <label
                htmlFor="packingFacility"
                className="text-sm text-ink-muted"
              >
                Packing Facility
              </label>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );

  // Render Manpower & Production Step
  const renderManpowerStep = () => (
    <Panel label="Manpower and Production Details">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Manpower & Production Details
        </h2>
      </div>

      <div className="space-y-8">
        {/* Manpower Section */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Manpower Details
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Total Operators">
              <Input
                type="number"
                value={formData.manpower.totalOperators}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "totalOperators",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Skilled Operators">
              <Input
                type="number"
                value={formData.manpower.skilledOperators}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "skilledOperators",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Supervisors">
              <Input
                type="number"
                value={formData.manpower.supervisors}
                onChange={(e) =>
                  handleInputChange("manpower", "supervisors", e.target.value)
                }
              />
            </Field>

            <Field label="Helpers">
              <Input
                type="number"
                value={formData.manpower.helpers}
                onChange={(e) =>
                  handleInputChange("manpower", "helpers", e.target.value)
                }
              />
            </Field>

            <Field label="Absenteeism Rate (%)">
              <Input
                type="text"
                value={formData.manpower.absenteeismRate}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "absenteeismRate",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Number of Shifts">
              <Input
                type="number"
                value={formData.manpower.shifts}
                onChange={(e) =>
                  handleInputChange("manpower", "shifts", e.target.value)
                }
              />
            </Field>

            <Field label="Working Hours">
              <Input
                type="text"
                value={formData.manpower.workingHours}
                onChange={(e) =>
                  handleInputChange("manpower", "workingHours", e.target.value)
                }
                placeholder="e.g., 9 AM - 6 PM"
              />
            </Field>

            <Field label="Weekly Off">
              <Input
                type="text"
                value={formData.manpower.weeklyOff}
                onChange={(e) =>
                  handleInputChange("manpower", "weeklyOff", e.target.value)
                }
                placeholder="e.g., Sunday"
              />
            </Field>
          </div>
        </div>

        {/* Production Section */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Production Reality
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Avg Production/Machine/Day">
              <Input
                type="number"
                value={formData.manpower.avgProductionPerMachine}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "avgProductionPerMachine",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Monthly Production">
              <Input
                type="number"
                value={formData.manpower.monthlyProduction}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "monthlyProduction",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Rejection Rate (%)">
              <Input
                type="text"
                value={formData.manpower.rejectionRate}
                onChange={(e) =>
                  handleInputChange("manpower", "rejectionRate", e.target.value)
                }
              />
            </Field>

            <Field label="Rework Rate (%)">
              <Input
                type="text"
                value={formData.manpower.reworkRate}
                onChange={(e) =>
                  handleInputChange("manpower", "reworkRate", e.target.value)
                }
              />
            </Field>

            <Field label="Overtime Required">
              <Select
                value={formData.manpower.overtimeRequired}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "overtimeRequired",
                    e.target.value,
                  )
                }
              >
                <option value="">Select Level</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </Select>
            </Field>
          </div>
        </div>

        {/* Experience Section */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Work Experience
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Highest Complexity Handled">
              <Input
                type="text"
                value={formData.manpower.highestComplexity}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "highestComplexity",
                    e.target.value,
                  )
                }
                placeholder="e.g., Formal Jackets, Denim"
              />
            </Field>

            <Field label="Sample Development Time">
              <Input
                type="text"
                value={formData.manpower.sampleTime}
                onChange={(e) =>
                  handleInputChange("manpower", "sampleTime", e.target.value)
                }
                placeholder="e.g., 5-7 days"
              />
            </Field>

            <Field label="Major Customers/Brands" className="md:col-span-2">
              <Input
                type="text"
                value={formData.manpower.majorCustomers}
                onChange={(e) =>
                  handleInputChange(
                    "manpower",
                    "majorCustomers",
                    e.target.value,
                  )
                }
                placeholder="e.g., Brand A, Brand B, Export Clients"
              />
            </Field>
          </div>
        </div>

        {/* SAM Capacity Section */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            SAM Capacity
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Average SAM">
              <Input
                type="number"
                step="0.1"
                value={formData.samCapacity.avgSAM}
                onChange={(e) =>
                  handleInputChange("samCapacity", "avgSAM", e.target.value)
                }
              />
            </Field>

            <Field label="Total Monthly SAM Capacity">
              <Input
                type="number"
                value={formData.samCapacity.totalMonthlySAM}
                onChange={(e) =>
                  handleInputChange(
                    "samCapacity",
                    "totalMonthlySAM",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Comfortable Workload">
              <Input
                type="number"
                value={formData.samCapacity.comfortableWorkload}
                onChange={(e) =>
                  handleInputChange(
                    "samCapacity",
                    "comfortableWorkload",
                    e.target.value,
                  )
                }
              />
            </Field>

            <Field label="Maximum Workload">
              <Input
                type="number"
                value={formData.samCapacity.maxWorkload}
                onChange={(e) =>
                  handleInputChange(
                    "samCapacity",
                    "maxWorkload",
                    e.target.value,
                  )
                }
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Note: SAM capacity is for planning purposes only, not for billing
          </p>
        </div>
      </div>
    </Panel>
  );

  // Render Financial Details Step
  const renderFinancialStep = () => (
    <Panel label="Financial Details">
      <div className="flex items-center gap-3 mb-6">
        <Banknote className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Financial Details
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Yearly Turnover">
          <Input
            type="text"
            value={formData.financial.yearlyTurnover}
            onChange={(e) =>
              handleInputChange("financial", "yearlyTurnover", e.target.value)
            }
            placeholder="e.g., ₹50 lakhs"
          />
        </Field>

        <Field label="Monthly Fixed Expenses">
          <Input
            type="text"
            value={formData.financial.monthlyFixedExpenses}
            onChange={(e) =>
              handleInputChange(
                "financial",
                "monthlyFixedExpenses",
                e.target.value,
              )
            }
            placeholder="e.g., ₹5 lakhs"
          />
        </Field>

        <Field label="Monthly Salary Payout">
          <Input
            type="text"
            value={formData.financial.monthlySalaryPayout}
            onChange={(e) =>
              handleInputChange(
                "financial",
                "monthlySalaryPayout",
                e.target.value,
              )
            }
            placeholder="e.g., ₹2 lakhs"
          />
        </Field>

        <Field label="Working Capital">
          <Input
            type="text"
            value={formData.financial.workingCapital}
            onChange={(e) =>
              handleInputChange("financial", "workingCapital", e.target.value)
            }
            placeholder="e.g., ₹10 lakhs"
          />
        </Field>

        <Field label="Sustainability (Months without new work)">
          <Input
            type="number"
            value={formData.financial.sustainabilityMonths}
            onChange={(e) =>
              handleInputChange(
                "financial",
                "sustainabilityMonths",
                e.target.value,
              )
            }
          />
        </Field>

        <Field label="Existing Loans/EMIs">
          <Input
            type="text"
            value={formData.financial.existingLoans}
            onChange={(e) =>
              handleInputChange("financial", "existingLoans", e.target.value)
            }
            placeholder="e.g., ₹5 lakhs"
          />
        </Field>

        <Field label="Working Capital Position">
          <Select
            value={formData.financial.workingCapitalPosition}
            onChange={(e) =>
              handleInputChange(
                "financial",
                "workingCapitalPosition",
                e.target.value,
              )
            }
          >
            <option value="">Select Position</option>
            <option value="Good">Good</option>
            <option value="Average">Average</option>
            <option value="Tight">Tight</option>
          </Select>
        </Field>

        <Field label="Past Defaults (if any)">
          <Input
            type="text"
            value={formData.financial.pastDefaults}
            onChange={(e) =>
              handleInputChange("financial", "pastDefaults", e.target.value)
            }
            placeholder="e.g., None, Cleared all"
          />
        </Field>

        <div className="md:col-span-2">
          <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-risk-ink)]" />
              <div>
                <p className="text-sm font-medium text-[var(--state-risk-ink)]">
                  Financial Information Usage
                </p>
                <p className="mt-1 text-xs text-[var(--state-risk-ink)]">
                  This information is used to understand the vendor's financial
                  stability and determine minimum work requirements to keep the
                  factory operational.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );

  // Render Business Terms Step
  const renderBusinessStep = () => (
    <Panel label="Business Terms">
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Business Terms
        </h2>
      </div>

      {errorMessages.validation && currentStep === 5 && (
        <ErrorMessage
          type="validation"
          message={errorMessages.validation}
          onClose={() =>
            setErrorMessages((prev) => ({ ...prev, validation: null }))
          }
        />
      )}

      <div className="space-y-8">
        {/* Business Terms */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Terms & Conditions
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Lead Time" required>
              <Input
                type="text"
                value={formData.business.leadTime}
                onChange={(e) =>
                  handleInputChange("business", "leadTime", e.target.value)
                }
                required
                placeholder="e.g., 5-7 days"
              />
            </Field>

            <Field label="Payment Terms" required>
              <Select
                value={formData.business.paymentTerms}
                onChange={(e) =>
                  handleInputChange("business", "paymentTerms", e.target.value)
                }
                required
              >
                <option value="">Select Terms</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="COD">COD</option>
              </Select>
            </Field>
          </div>
        </div>

        {/* Bank Details */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Bank Details
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Bank Name">
              <Input
                type="text"
                value={formData.business.bankName}
                onChange={(e) =>
                  handleInputChange("business", "bankName", e.target.value)
                }
              />
            </Field>

            <Field label="Account Number">
              <Input
                type="text"
                value={formData.business.accountNumber}
                onChange={(e) =>
                  handleInputChange("business", "accountNumber", e.target.value)
                }
              />
            </Field>

            <Field label="IFSC Code">
              <Input
                type="text"
                value={formData.business.ifscCode}
                onChange={(e) =>
                  handleInputChange("business", "ifscCode", e.target.value)
                }
              />
            </Field>

            <Field label="Account Holder Name">
              <Input
                type="text"
                value={formData.business.accountHolderName}
                onChange={(e) =>
                  handleInputChange(
                    "business",
                    "accountHolderName",
                    e.target.value,
                  )
                }
              />
            </Field>
          </div>
        </div>

        {/* Address */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Business Address
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Complete Address" className="md:col-span-2">
              <Textarea
                value={formData.business.address}
                onChange={(e) =>
                  handleInputChange("business", "address", e.target.value)
                }
                rows="2"
              />
            </Field>

            <Field label="City">
              <Input
                type="text"
                value={formData.business.city}
                onChange={(e) =>
                  handleInputChange("business", "city", e.target.value)
                }
              />
            </Field>

            <Field label="State">
              <Input
                type="text"
                value={formData.business.state}
                onChange={(e) =>
                  handleInputChange("business", "state", e.target.value)
                }
              />
            </Field>

            <Field label="Pincode">
              <Input
                type="text"
                value={formData.business.pincode}
                onChange={(e) =>
                  handleInputChange("business", "pincode", e.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </div>
    </Panel>
  );

  // Render Documents Step
  const renderDocumentsStep = () => (
    <Panel label="Documents Upload">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-5 w-5 text-ink-muted" />
        <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
          Documents Upload
        </h2>
      </div>

      {errorMessages.upload && (
        <ErrorMessage
          type="upload"
          message={errorMessages.upload}
          onClose={() =>
            setErrorMessages((prev) => ({ ...prev, upload: null }))
          }
        />
      )}

      <div className="space-y-8">
        {/* Profile Image */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Company Profile
          </h3>
          <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-hairline bg-[var(--control)]">
                {uploadedFiles.profileImage ? (
                  <img
                    src={uploadedFiles.profileImage.url}
                    alt="Company Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-ink-faint" />
                )}
              </div>
              <p className="mb-2 text-sm text-ink-muted">
                Company/Facility Image
              </p>
              <p className="mb-3 text-xs text-ink-faint">
                JPG, PNG, WebP (Max: 5MB)
              </p>
              <input
                type="file"
                className="hidden"
                id="profileImage"
                ref={(el) => (fileInputRefs.current.profileImage = el)}
                onChange={(e) =>
                  handleFileUpload("profileImage", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png,.webp"
                disabled={uploadingFile}
              />
              <label
                htmlFor="profileImage"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.profileImage ? "Change Image" : "Upload Image"}
              </label>
              <UploadSpinner isUploading={uploadingFile} field="profileImage" />
              {uploadedFiles.profileImage && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded successfully
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    <span data-figure>
                      {(uploadedFiles.profileImage.size / 1024).toFixed(2)}
                    </span>{" "}
                    KB
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Required Documents */}
        <div>
          <h3 className="mb-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
            Required Documents (Images Only)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {/* GST Certificate */}
            <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4 text-center transition-colors hover:bg-[var(--control)]">
              <FileText className="mx-auto mb-3 h-9 w-9 text-ink-faint" />
              <p className="mb-1 text-sm font-medium text-ink">
                GST Certificate
              </p>
              <p className="mb-3 text-xs text-ink-faint">JPG, PNG (Max: 5MB)</p>
              <input
                type="file"
                className="hidden"
                id="gstCertificate"
                ref={(el) => (fileInputRefs.current.gstCertificate = el)}
                onChange={(e) =>
                  handleFileUpload("gstCertificate", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png"
                disabled={uploadingFile}
              />
              <label
                htmlFor="gstCertificate"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.gstCertificate ? "Change" : "Upload"}
              </label>
              <UploadSpinner
                isUploading={uploadingFile}
                field="gstCertificate"
              />
              {uploadedFiles.gstCertificate && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </p>
                </div>
              )}
            </div>

            {/* PAN Card */}
            <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4 text-center transition-colors hover:bg-[var(--control)]">
              <FileText className="mx-auto mb-3 h-9 w-9 text-ink-faint" />
              <p className="mb-1 text-sm font-medium text-ink">PAN Card</p>
              <p className="mb-3 text-xs text-ink-faint">JPG, PNG (Max: 5MB)</p>
              <input
                type="file"
                className="hidden"
                id="panCard"
                ref={(el) => (fileInputRefs.current.panCard = el)}
                onChange={(e) =>
                  handleFileUpload("panCard", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png"
                disabled={uploadingFile}
              />
              <label
                htmlFor="panCard"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.panCard ? "Change" : "Upload"}
              </label>
              <UploadSpinner isUploading={uploadingFile} field="panCard" />
              {uploadedFiles.panCard && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </p>
                </div>
              )}
            </div>

            {/* Udyam Certificate */}
            <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4 text-center transition-colors hover:bg-[var(--control)]">
              <FileText className="mx-auto mb-3 h-9 w-9 text-ink-faint" />
              <p className="mb-1 text-sm font-medium text-ink">
                Udyam Certificate
              </p>
              <p className="mb-3 text-xs text-ink-faint">JPG, PNG (Max: 5MB)</p>
              <input
                type="file"
                className="hidden"
                id="udyamCertificate"
                ref={(el) => (fileInputRefs.current.udyamCertificate = el)}
                onChange={(e) =>
                  handleFileUpload("udyamCertificate", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png"
                disabled={uploadingFile}
              />
              <label
                htmlFor="udyamCertificate"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.udyamCertificate ? "Change" : "Upload"}
              </label>
              <UploadSpinner
                isUploading={uploadingFile}
                field="udyamCertificate"
              />
              {uploadedFiles.udyamCertificate && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </p>
                </div>
              )}
            </div>

            {/* Labour License */}
            <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4 text-center transition-colors hover:bg-[var(--control)]">
              <FileText className="mx-auto mb-3 h-9 w-9 text-ink-faint" />
              <p className="mb-1 text-sm font-medium text-ink">
                Labour License
              </p>
              <p className="mb-3 text-xs text-ink-faint">JPG, PNG (Max: 5MB)</p>
              <input
                type="file"
                className="hidden"
                id="labourLicenseCopy"
                ref={(el) => (fileInputRefs.current.labourLicenseCopy = el)}
                onChange={(e) =>
                  handleFileUpload("labourLicenseCopy", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png"
                disabled={uploadingFile}
              />
              <label
                htmlFor="labourLicenseCopy"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.labourLicenseCopy ? "Change" : "Upload"}
              </label>
              <UploadSpinner
                isUploading={uploadingFile}
                field="labourLicenseCopy"
              />
              {uploadedFiles.labourLicenseCopy && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </p>
                </div>
              )}
            </div>

            {/* Cancelled Cheque */}
            <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4 text-center transition-colors hover:bg-[var(--control)]">
              <FileText className="mx-auto mb-3 h-9 w-9 text-ink-faint" />
              <p className="mb-1 text-sm font-medium text-ink">
                Cancelled Cheque
              </p>
              <p className="mb-3 text-xs text-ink-faint">JPG, PNG (Max: 5MB)</p>
              <input
                type="file"
                className="hidden"
                id="bankCheque"
                ref={(el) => (fileInputRefs.current.bankCheque = el)}
                onChange={(e) =>
                  handleFileUpload("bankCheque", e.target.files?.[0])
                }
                accept=".jpg,.jpeg,.png"
                disabled={uploadingFile}
              />
              <label
                htmlFor="bankCheque"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="w-4 h-4" />
                {uploadedFiles.bankCheque ? "Change" : "Upload"}
              </label>
              <UploadSpinner isUploading={uploadingFile} field="bankCheque" />
              {uploadedFiles.bankCheque && !uploadingFile && (
                <div className="mt-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--state-positive-ink)]">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Additional Documents */}
        <div className="border-t border-hairline pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-medium tracking-[-0.015em] text-ink">
              Additional Documents
            </h3>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setAdditionalDocuments([
                  ...additionalDocuments,
                  {
                    id: Date.now(),
                    title: "",
                    file: null,
                  },
                ])
              }
            >
              <Plus className="w-4 h-4" />
              Add Document
            </Button>
          </div>

          <p className="mb-4 text-sm text-ink-muted">
            Add any other documents (Experience letters, Certificates, Factory
            photos, etc.)
          </p>

          {additionalDocuments.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline py-8 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-ink-faint" />
              <p className="text-sm text-ink-muted">
                No additional documents added
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {additionalDocuments.map((doc, index) => (
                <div
                  key={doc.id}
                  className="rounded-card border border-hairline p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <Field label="Document Title" className="mb-3">
                        <Input
                          type="text"
                          value={doc.title}
                          onChange={(e) => {
                            const updatedDocs = [...additionalDocuments];
                            updatedDocs[index].title = e.target.value;
                            setAdditionalDocuments(updatedDocs);
                          }}
                          placeholder="e.g., Factory Photo, Experience Certificate"
                        />
                      </Field>

                      <div className="rounded-card border border-dashed border-hairline bg-[var(--surface-sunken)] p-4">
                        <div className="text-center">
                          <p className="mb-2 text-sm text-ink-muted">
                            Upload document
                          </p>
                          <p className="mb-3 text-xs text-ink-faint">
                            JPG, PNG, WebP (Max: 5MB)
                          </p>
                          <input
                            type="file"
                            className="hidden"
                            id={`additional-doc-${doc.id}`}
                            onChange={(e) =>
                              handleAdditionalDocumentUpload(
                                doc.id,
                                e.target.files?.[0],
                                doc.title || `Document ${index + 1}`,
                              )
                            }
                            accept=".jpg,.jpeg,.png,.webp"
                            disabled={uploadingFile === `additional-${doc.id}`}
                          />
                          <label
                            htmlFor={`additional-doc-${doc.id}`}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-[var(--body-bg)] transition-opacity hover:opacity-90
                              ${uploadingFile === `additional-${doc.id}` ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <Upload className="w-4 h-4" />
                            {doc.url ? "Change Document" : "Choose Document"}
                          </label>

                          {uploadingFile === `additional-${doc.id}` && (
                            <div className="mt-2">
                              <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
                            </div>
                          )}

                          {doc.url && !uploadingFile && (
                            <div className="mt-3">
                              <div className="flex items-center justify-center gap-2">
                                <Check className="h-4 w-4 text-[var(--state-positive-ink)]" />
                                <span className="text-xs text-[var(--state-positive-ink)]">
                                  Uploaded successfully
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setAdditionalDocuments(
                          additionalDocuments.filter((d) => d.id !== doc.id),
                        )
                      }
                      className="rounded-full p-1 text-[var(--state-overdue-ink)] transition-colors hover:bg-[var(--control)]"
                      title="Remove document"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );

  // Navigation Buttons
  const renderNavigationButtons = () => (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-hairline pt-6 sm:flex-row">
      <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-start">
        {currentStep > 0 && (
          <Button
            type="button"
            tone="secondary"
            onClick={handlePrevStep}
            disabled={isSubmitting || uploadingFile}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
        )}

        {/* Quick Add Button - Only show on first step AND NOT in edit mode */}
        {currentStep === 0 && !isEditMode && (
          <Button
            type="button"
            tone="secondary"
            onClick={handleQuickAdd}
            disabled={isSubmitting || uploadingFile}
          >
            <Check className="w-4 h-4" />
            <span>Quick Add (Basic Info Only)</span>
          </Button>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-end">
        <Button
          type="button"
          tone="ghost"
          onClick={() => {
            if (
              window.confirm(
                "Are you sure you want to cancel? All unsaved changes will be lost.",
              )
            ) {
              router.push("/hr/dashboard/vendors");
            }
          }}
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Cancel</span>
        </Button>

        {currentStep === formSections.length - 1 ? (
          <Button
            type="button"
            tone="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || uploadingFile}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isEditMode ? "Updating..." : "Creating..."}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isEditMode ? "Update Vendor" : "Create Vendor"}</span>
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            tone="primary"
            onClick={handleNextStep}
            disabled={isSubmitting || uploadingFile}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  // Render current step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderBasicInfoStep();
      case 1:
        return renderLegalStep();
      case 2:
        return renderFactoryStep();
      case 3:
        return renderManpowerStep();
      case 4:
        return renderFinancialStep();
      case 5:
        return renderBusinessStep();
      case 6:
        return renderDocumentsStep();
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
      {/* Form Header with Step Indicator */}
      <StepIndicator />

      {/* Global Error Messages */}
      {errorMessages.form && (
        <ErrorMessage
          type="form"
          message={errorMessages.form}
          onClose={() => setErrorMessages((prev) => ({ ...prev, form: null }))}
        />
      )}

      <form onSubmit={handleSubmit}>
        {/* Current Step Content */}
        {renderCurrentStep()}

        {/* Navigation Buttons */}
        {renderNavigationButtons()}
      </form>
    </div>
  );
}
